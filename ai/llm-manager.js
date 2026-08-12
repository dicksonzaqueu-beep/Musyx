/**
 * Musyx AI Layer — LLM Manager / AI Coordinator (Phase 3)
 * =======================================================
 * The central "brain" that sits between the app's features (prompt engine,
 * lyrics) and the raw providers in the registry. Features never call a provider
 * directly — they call the manager, which decides:
 *
 *   1. WHICH provider runs (the active one, then fallbacks in chain order)
 *   2. RETRY on transient failures (with capped exponential backoff)
 *   3. FALLBACK to the next provider when one is down/unauthorized
 *   4. ERROR NORMALIZATION so callers get one predictable result shape
 *   5. OFFLINE QUEUEING — when there's no network, the job is persisted and
 *      replayed automatically when connectivity returns
 *   6. TIMEOUT — every call is bounded so the UI never hangs forever
 *
 * WHY A MANAGER INSTEAD OF CALLING PROVIDERS DIRECTLY?
 *   Retry/fallback/queue logic is identical for every capability. Putting it in
 *   one place means the prompt engine and lyrics engine (Phases 4–5) stay tiny
 *   and dumb: they describe WHAT they want, the manager handles HOW it's
 *   delivered. Add Claude/Gemini and the manager fails over to them for free.
 *
 * WHY THIS IS OPTIMAL FOR MUSYX SPECIFICALLY:
 *   The target market has flaky, expensive connections. A naive app throws an
 *   error the moment a request fails. This manager instead retries the same
 *   provider, then a cheaper/alternate provider, then — only if truly offline —
 *   queues the job locally and tells the user it'll finish when they reconnect.
 *   That is the offline-first promise made real at the AI layer.
 *
 * WRAPPER-SAFE: pure fetch + plain objects + injected storage/net adapters.
 * No DOM, no window.location, no cookies, no service-worker dependency. Runs
 * identically in a browser tab and inside a Capacitor native shell.
 *
 * REQUEST LIFECYCLE (text example):
 *   feature.buildPrompt()
 *     -> manager.llm({system,user})
 *          -> online?  no  -> queue.enqueue('llm', payload) -> returns {ok:false, error:{kind:'offline'}}
 *          -> online?  yes -> for each provider in registry.chain('llm'):
 *                                try complete() with timeout
 *                                  ok            -> return result (+meta.latency)
 *                                  retryable     -> backoff, retry up to N times
 *                                  not retryable -> move to next provider
 *                              all exhausted -> return {ok:false, error:{kind:'provider_down'}}
 */

import { registry } from './registry.js';
import { fail } from './interfaces.js';

const DEFAULTS = {
  retries: 2,          // attempts per provider before moving on
  backoffMs: 600,      // base backoff, doubled each retry
  timeoutMs: 45000,    // hard cap per attempt (music polling handled separately)
  maxBackoffMs: 4000,
};

/**
 * Create the manager. Dependencies (storage, network check) are INJECTED so the
 * manager has no hard dependency on IndexedDB or navigator — that keeps it
 * testable and wrapper-safe. The app passes real adapters; tests pass fakes.
 *
 * @param {{
 *   isOnline: () => boolean,
 *   queue: {
 *     enqueue: (type: string, payload: any) => Promise<any>,
 *     drain: (handler: (job: any) => Promise<boolean>) => Promise<void>
 *   },
 *   onEvent?: (evt: {type: string, [k: string]: any}) => void,
 *   config?: Partial<typeof DEFAULTS>
 * }} deps
 */
export function createAIManager(deps) {
  const cfg = { ...DEFAULTS, ...(deps.config || {}) };
  const emit = (evt) => { try { deps.onEvent && deps.onEvent(evt); } catch (_) {} };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Race a provider call against a timeout so the UI never hangs. */
  async function withTimeout(promise, ms, onAbort) {
    let to;
    const timeout = new Promise((_, rej) => {
      to = setTimeout(() => { try { onAbort && onAbort(); } catch (_) {} rej(new Error('timeout')); }, ms);
    });
    try { return await Promise.race([promise, timeout]); }
    finally { clearTimeout(to); }
  }

  /**
   * Core execution: walk the provider chain for a capability, applying retry and
   * fallback. `invoke(provider)` performs the one capability-specific call and
   * returns an AIResult.
   *
   * @param {'llm'|'music'|'translation'|'image'} capability
   * @param {(provider:any, signal:AbortSignal)=>Promise<any>} invoke
   * @param {{queueType?: string, queuePayload?: any}} opts
   */
  async function run(capability, invoke, opts = {}) {
    // Offline short-circuit: don't even try; queue if this job is queueable.
    if (!deps.isOnline()) {
      if (opts.queueType) {
        await deps.queue.enqueue(opts.queueType, opts.queuePayload);
        emit({ type: 'queued', capability, reason: 'offline' });
        return fail('offline', 'no connection — job queued', true);
      }
      return fail('offline', 'no connection', true);
    }

    const chain = opts.providers && opts.providers.length ? opts.providers : registry.chain(capability);
    if (!chain.length) return fail('bad_request', `no ${capability} provider registered`, false);

    let lastErr = fail('unknown', 'no attempt made', false);

    for (const provider of chain) {
      for (let attempt = 0; attempt <= cfg.retries; attempt++) {
        const controller = new AbortController();
        const started = Date.now();
        try {
          const result = await withTimeout(
            invoke(provider, controller.signal),
            cfg.timeoutMs,
            () => controller.abort()
          );

          if (result && result.ok) {
            result.meta = { ...(result.meta || {}), provider: provider.info.id, latencyMs: Date.now() - started };
            emit({ type: 'success', capability, provider: provider.info.id, latencyMs: result.meta.latencyMs });
            return result;
          }

          // structured failure
          lastErr = result || fail('unknown', 'empty result', false);
          emit({ type: 'attempt_failed', capability, provider: provider.info.id, attempt, kind: lastErr.error?.kind });

          // decide: retry same provider, or move on
          if (lastErr.error && lastErr.error.retryable && attempt < cfg.retries) {
            const back = Math.min(cfg.backoffMs * 2 ** attempt, cfg.maxBackoffMs);
            await sleep(back);
            continue; // retry same provider
          }
          break; // give up on this provider, try next in chain
        } catch (e) {
          // thrown (timeout or unexpected) — treat as retryable transient
          lastErr = fail('timeout', String(e && e.message || e), true);
          emit({ type: 'attempt_error', capability, provider: provider.info.id, attempt, message: lastErr.error.message });
          if (attempt < cfg.retries) {
            const back = Math.min(cfg.backoffMs * 2 ** attempt, cfg.maxBackoffMs);
            await sleep(back);
            continue;
          }
          break;
        }
      }
      emit({ type: 'fallback', capability, from: provider.info.id });
    }

    // Every provider exhausted. Queue if allowed (e.g. a music job worth keeping).
    if (opts.queueType) {
      await deps.queue.enqueue(opts.queueType, opts.queuePayload);
      emit({ type: 'queued', capability, reason: 'all_failed' });
    }
    return lastErr;
  }

  return {
    /* ---- public API used by features ---- */

    /**
     * Run an LLM completion with full retry/fallback/queue handling.
     * @param {import('./interfaces.js').LLMRequest} req
     * @param {{queue?: boolean}=} o
     */
    async llm(req, o = {}) {
      return run(
        'llm',
        (provider, signal) => provider.complete({ ...req, signal }),
        o.queue ? { queueType: 'llm', queuePayload: req } : {}
      );
    },

    /**
     * Start a music generation. Music is inherently online + queueable, so it
     * defaults to queueing on failure/offline (matches the app's offline-first flow).
     * Optionally pass a capability-selected `providers` order (from music-selector)
     * to steer which provider runs first; otherwise the registry chain is used.
     * @param {import('./interfaces.js').MusicRequest} req
     * @param {{providers?: any[]}=} o
     */
    async musicStart(req, o = {}) {
      return run(
        'music',
        (provider, signal) => provider.start({ ...req, signal }),
        // during queue replay (o.noQueue) the queue manager owns retry — don't re-enqueue
        o.noQueue
          ? { providers: o.providers }
          : { queueType: 'music', queuePayload: req, providers: o.providers }
      );
    },

    /**
     * Poll a music job by id on the ACTIVE provider (no fallback — the id is
     * provider-specific). Retries transient failures only.
     * @param {string} id
     */
    async musicPoll(id) {
      const provider = registry.get('music');
      if (!provider) return fail('bad_request', 'no music provider', false);
      for (let attempt = 0; attempt <= cfg.retries; attempt++) {
        const res = await provider.poll(id);
        if (res.ok) return res;
        if (res.error && res.error.retryable && attempt < cfg.retries) {
          await sleep(Math.min(cfg.backoffMs * 2 ** attempt, cfg.maxBackoffMs));
          continue;
        }
        return res;
      }
      return fail('timeout', 'poll exhausted', true);
    },

    /** Translate content with retry/fallback. */
    async translate(req, o = {}) {
      return run(
        'translation',
        (provider, signal) => provider.translate({ ...req, signal }),
        o.queue ? { queueType: 'translation', queuePayload: req } : {}
      );
    },

    /**
     * Replay queued AI jobs when connectivity returns. Delegates the actual
     * dedup/retry/backoff/conflict logic to the injected queue (Phase 7 queue
     * manager). We pass a `runner` that executes one job through this manager, and
     * a `reconcile` hook that repairs a job against the CURRENT world before it
     * runs (e.g. re-point a music job whose provider is no longer registered).
     */
    async processQueue() {
      if (!deps.isOnline()) return;
      const runner = async (job) => {
        emit({ type: 'replay', jobType: job.type });
        if (job.type === 'llm') return this.llm(job.payload, { queue: false });
        if (job.type === 'music') return this.musicStart(job.payload, { noQueue: true });
        if (job.type === 'translation') return this.translate(job.payload, { queue: false });
        return { ok: true }; // unknown type — treat as done so it's removed
      };
      const reconcile = (job) => {
        // Conflict resolution: if a music job references a provider that no longer
        // exists, drop the stale reference so it re-selects against current state.
        if (job.type === 'music' && job.payload && job.payload._providerId) {
          if (!registry.getById('music', job.payload._providerId)) {
            const { _providerId, ...rest } = job.payload;
            job.payload = rest;
          }
        }
        return job;
      };
      // Prefer the richer process(runner, reconcile); fall back to legacy drain().
      if (typeof deps.queue.process === 'function') {
        await deps.queue.process(runner, reconcile);
      } else if (typeof deps.queue.drain === 'function') {
        await deps.queue.drain(async (job) => {
          const res = await runner(job);
          return !!(res && res.ok);
        });
      }
    },
  };
}
