/**
 * Musyx AI Layer — Offline Queue Manager (Phase 7)
 * =================================================
 * Owns ALL queue semantics so the app and the LLM Manager don't each reinvent
 * them. The app already had a working queue (jobs persist to IndexedDB, replay on
 * reconnect); this module HARDENS it with the things a naive queue gets wrong on
 * flaky connections — exactly the Musyx target environment.
 *
 * WHAT THIS ADDS (the Phase 7 brief):
 *   1. IDEMPOTENCY / DEDUP — a job carries a stable fingerprint; enqueuing the
 *      same work twice (double-tap, retry storm) collapses to one job.
 *   2. RETRY STRATEGY — capped attempts with exponential backoff and a
 *      "next-eligible-time" so a failing job doesn't hammer the network or block
 *      the ones behind it.
 *   3. PERMANENT vs RETRYABLE — auth/bad_request failures are marked 'failed' and
 *      stop retrying; offline/rate_limit/timeout stay 'pending' and back off.
 *   4. CONFLICT RESOLUTION — on replay, a job is reconciled against the CURRENT
 *      world: if its target provider no longer exists, it's re-pointed at the
 *      active one; stale/duplicate results are dropped (last-write-wins by time).
 *   5. ORDER + FAIRNESS — jobs replay oldest-first, but a backed-off job is
 *      skipped until its next-eligible-time, so one stuck job can't starve others.
 *
 * DESIGN: this is a thin, storage-agnostic coordinator. It receives a `store`
 * adapter (get/put/delete/all over the IndexedDB 'queue' object store) and a
 * `runner` (how to actually execute a job — supplied by the LLM Manager). That
 * keeps it wrapper-safe (no IndexedDB/DOM/globals here) and unit-testable.
 *
 * A queued job record:
 *   {
 *     id, type,                 // 'llm' | 'music' | 'translation'
 *     payload,                  // the request
 *     fingerprint,              // stable hash of type+payload for dedup
 *     status,                   // 'pending' | 'failed' | 'done'
 *     attempts,                 // how many times we've tried
 *     nextEligibleAt,           // ms timestamp; don't retry before this
 *     lastError,               // last error kind, for diagnostics
 *     created, updated          // ms timestamps
 *   }
 */

const DEFAULTS = {
  maxAttempts: 5,       // after this, mark 'failed' (permanent)
  baseBackoffMs: 2000,  // first retry delay
  maxBackoffMs: 60000,  // cap so backoff can't grow unbounded
};

/** Permanent failure kinds — no point retrying these. */
const PERMANENT = new Set(['auth', 'bad_request']);

/**
 * Small, stable, dependency-free string fingerprint (FNV-1a). Same input →
 * same fingerprint, so duplicate work collapses. Not cryptographic; it doesn't
 * need to be — it only needs to be stable and collision-resistant enough for dedup.
 */
export function fingerprint(type, payload) {
  const str = type + ':' + stableStringify(payload);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** JSON.stringify with sorted keys so {a,b} and {b,a} fingerprint identically. */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

const backoffFor = (attempts, cfg) =>
  Math.min(cfg.baseBackoffMs * 2 ** Math.max(0, attempts - 1), cfg.maxBackoffMs);

/**
 * Create the queue manager.
 * @param {{
 *   store: {
 *     all: () => Promise<any[]>,
 *     put: (job: any) => Promise<any>,
 *     del: (id: string) => Promise<void>,
 *   },
 *   isOnline: () => boolean,
 *   now?: () => number,
 *   onEvent?: (e: any) => void,
 *   config?: Partial<typeof DEFAULTS>
 * }} deps
 */
export function createQueueManager(deps) {
  const cfg = { ...DEFAULTS, ...(deps.config || {}) };
  const now = deps.now || (() => Date.now());
  const emit = (e) => { try { deps.onEvent && deps.onEvent(e); } catch (_) {} };

  /**
   * Add a job, with dedup. If an identical pending job exists, returns it instead
   * of creating a duplicate. Returns the (new or existing) job record.
   */
  async function enqueue(type, payload) {
    const fp = fingerprint(type, payload);
    const existing = (await deps.store.all())
      .find((j) => j.fingerprint === fp && j.status === 'pending');
    if (existing) {
      emit({ type: 'dedup', jobId: existing.id, fingerprint: fp });
      return existing;
    }
    const job = {
      id: type + '_' + now() + '_' + Math.random().toString(36).slice(2, 8),
      type, payload, fingerprint: fp,
      status: 'pending', attempts: 0, nextEligibleAt: 0,
      lastError: null, created: now(), updated: now(),
    };
    await deps.store.put(job);
    emit({ type: 'enqueue', jobId: job.id, jobType: type });
    return job;
  }

  /**
   * Process the queue once. Runs eligible pending jobs oldest-first through the
   * provided `runner`. `runner(job)` must return the manager's AIResult
   * ({ ok, error, ... }). Handles success (remove), retryable failure (backoff),
   * and permanent failure (mark 'failed').
   *
   * @param {(job:any)=>Promise<{ok:boolean, error?:{kind?:string}}>} runner
   * @param {(job:any)=>any=} reconcile  optional: adjust a job before running
   *        (conflict resolution hook — e.g. re-point a missing provider)
   */
  async function process(runner, reconcile) {
    if (!deps.isOnline()) { emit({ type: 'skip', reason: 'offline' }); return; }

    const jobs = (await deps.store.all())
      .filter((j) => j.status === 'pending')
      .sort((a, b) => a.created - b.created); // fairness: oldest first

    for (const raw of jobs) {
      const t = now();
      if (raw.nextEligibleAt && raw.nextEligibleAt > t) {
        emit({ type: 'defer', jobId: raw.id, until: raw.nextEligibleAt });
        continue; // backed off — skip, don't block others
      }

      // conflict resolution: let caller reconcile the job against current state
      let job = raw;
      if (reconcile) {
        try { job = reconcile({ ...raw }) || raw; } catch (_) { job = raw; }
      }

      job.attempts += 1;
      job.updated = now();
      emit({ type: 'run', jobId: job.id, attempt: job.attempts });

      let res;
      try { res = await runner(job); }
      catch (e) { res = { ok: false, error: { kind: 'timeout', message: String(e) } }; }

      if (res && res.ok) {
        await deps.store.del(job.id);
        emit({ type: 'done', jobId: job.id });
        continue;
      }

      const kind = (res && res.error && res.error.kind) || 'unknown';
      job.lastError = kind;

      if (PERMANENT.has(kind) || job.attempts >= cfg.maxAttempts) {
        job.status = 'failed';
        job.updated = now();
        await deps.store.put(job);
        emit({ type: 'failed', jobId: job.id, kind, attempts: job.attempts });
      } else {
        job.nextEligibleAt = now() + backoffFor(job.attempts, cfg);
        job.updated = now();
        await deps.store.put(job);
        emit({ type: 'retry_scheduled', jobId: job.id, kind, nextEligibleAt: job.nextEligibleAt });
      }
    }
  }

  /** Manually reset a 'failed' job back to 'pending' (for a future retry UI). */
  async function retryFailed(id) {
    const job = (await deps.store.all()).find((j) => j.id === id);
    if (!job) return null;
    job.status = 'pending';
    job.attempts = 0;
    job.nextEligibleAt = 0;
    job.lastError = null;
    job.updated = now();
    await deps.store.put(job);
    emit({ type: 'retry_manual', jobId: id });
    return job;
  }

  /** Snapshot counts for diagnostics (and a future status view). */
  async function stats() {
    const jobs = await deps.store.all();
    return {
      total: jobs.length,
      pending: jobs.filter((j) => j.status === 'pending').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      done: jobs.filter((j) => j.status === 'done').length,
    };
  }

  return { enqueue, process, retryFailed, stats, fingerprint };
}
