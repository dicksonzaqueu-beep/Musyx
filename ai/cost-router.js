/**
 * Musyx AI Layer — Cost-Aware Routing & Local-First Gate (Phase 8)
 * ================================================================
 * Two working pieces + documented stubs, per the agreed Phase 8 scope.
 *
 * 1. TASK ROUTING (working): recommends which provider/model class should handle
 *    which task, by cost tier. This is the "cheap model for prompts, quality model
 *    for lyrics, WaveSpeed for music" policy, expressed as data the selector and
 *    manager can consult — real orchestration, matching the product thesis.
 *
 * 2. LOCAL-FIRST GATE (working): a single decision point that answers "should we
 *    spend money on this call at all, or can a local/free path serve it?" This
 *    formalizes what the app already does in spirit (rule-based prompt/lyrics run
 *    before any paid call) into an explicit, testable gate.
 *
 * 3. BATCHING + RATE LIMITING (documented stubs): seams only. Batching optimizes a
 *    traffic volume you don't have yet; client-side rate limiting is trivially
 *    bypassed and belongs in the worker. Built as no-op-safe stubs with notes so
 *    they're ready when the cost monitor shows they're needed.
 *
 * WRAPPER-SAFE: pure functions + plain config. No DOM, storage, or network.
 */

/**
 * TASK ROUTING POLICY
 * Which capability + task should prefer which cost tier. 'cheap' favors a low-cost
 * model; 'quality' favors a stronger one; 'local' means try the on-device/rule path
 * first. The manager/selector read this to pick sensibly by default.
 */
export const TASK_ROUTING = {
  // text tasks (LLM)
  'prompt.enhance': { tier: 'cheap', rationale: 'short, structured; a mini model is plenty' },
  'lyrics.generate': { tier: 'quality', rationale: 'creative quality matters most here' },
  'lyrics.improve': { tier: 'cheap', rationale: 'incremental edit; cheap model suffices' },
  'lyrics.translate': { tier: 'cheap', rationale: 'translation is well within mini-model range' },
  'lyrics.rhyme': { tier: 'cheap', rationale: 'short suggestions' },
  'lyrics.alternate': { tier: 'quality', rationale: 'wants genuine creative variation' },
  // music
  'music.generate': { tier: 'music', rationale: 'use the configured music provider (WaveSpeed default)' },
};

/**
 * Preference order of LLM providers per tier. The manager can use this to pick a
 * model when several are registered. Ids match the provider `info.id`s.
 */
export const TIER_PREFERENCE = {
  cheap: ['llm-openai'],   // extend with e.g. 'llm-gemini-flash', 'llm-mistral-small'
  quality: ['llm-openai'], // extend with e.g. 'llm-claude', 'llm-openai-gpt4'
};

/**
 * Recommend a routing decision for a task.
 * @param {string} taskKey e.g. 'lyrics.generate'
 * @returns {{tier:string, preferredProviderIds:string[], rationale:string}}
 */
export function routeTask(taskKey) {
  const policy = TASK_ROUTING[taskKey] || { tier: 'cheap', rationale: 'default' };
  const preferredProviderIds = TIER_PREFERENCE[policy.tier] || [];
  return { tier: policy.tier, preferredProviderIds, rationale: policy.rationale };
}

/* --------------------------------------------------------------------- *
 * LOCAL-FIRST GATE
 * --------------------------------------------------------------------- */

/**
 * Decide whether a paid call is warranted, or a local/free result should serve.
 * The gate returns a decision the caller acts on — it does not make the call
 * itself (keeps it pure and testable).
 *
 * Policy:
 *   - If offline → never spend; use local. (queue the paid call if desired)
 *   - If no LLM is configured/registered → use local rule-based path.
 *   - If the task is explicitly 'local-sufficient' (e.g. prompt already good
 *     enough for a demo) → use local.
 *   - Otherwise → allow the paid call.
 *
 * @param {{
 *   online: boolean,
 *   hasPaidProvider: boolean,
 *   localResultAcceptable?: boolean
 * }} ctx
 * @returns {{useLocal: boolean, reason: string}}
 */
export function localFirstGate(ctx) {
  if (!ctx.online) return { useLocal: true, reason: 'offline — using local, paid call can be queued' };
  if (!ctx.hasPaidProvider) return { useLocal: true, reason: 'no paid provider configured — using local rule-based path' };
  if (ctx.localResultAcceptable) return { useLocal: true, reason: 'local result acceptable — skipping paid call' };
  return { useLocal: false, reason: 'paid call warranted' };
}

/* --------------------------------------------------------------------- *
 * BATCHING (documented stub — intentionally not built now)
 * --------------------------------------------------------------------- */

/**
 * Placeholder batcher. Today it just runs each job immediately (no-op batching),
 * so callers can already route through it and gain real batching later with no
 * code change at the call site.
 *
 * WHY DEFERRED: batching only helps at traffic volume you don't have yet, and the
 * right batch window/size depends on real usage the cost monitor will reveal.
 * When needed, implement: collect requests within a short window, send as one
 * multi-prompt call where the provider supports it, and demultiplex results.
 *
 * @param {(job:any)=>Promise<any>} runOne
 */
export function createBatcher(runOne) {
  return {
    async submit(job) { return runOne(job); }, // immediate for now
    // future: flush(window), setBatchSize(n), etc.
    _isStub: true,
  };
}

/* --------------------------------------------------------------------- *
 * RATE LIMITING (light client guard + documented real enforcement point)
 * --------------------------------------------------------------------- */

/**
 * A LIGHT client-side guard: prevents accidental rapid-fire duplicate calls (e.g.
 * a user hammering "generate"). It is NOT security — a client limit is trivially
 * bypassed. REAL rate limiting must live in worker.js (server-side), keyed by
 * user/IP, where it can't be circumvented. This guard only improves UX and cuts
 * obvious waste.
 *
 * @param {{minIntervalMs?: number, now?: () => number}=} o
 */
export function createClientRateGuard(o = {}) {
  const minInterval = o.minIntervalMs ?? 1500;
  const now = o.now || (() => Date.now());
  const last = new Map(); // key -> last call time

  return {
    /** @returns {{allowed:boolean, waitMs:number}} */
    check(key) {
      const t = now();
      const prev = last.get(key) || 0;
      const delta = t - prev;
      if (delta < minInterval) return { allowed: false, waitMs: minInterval - delta };
      last.set(key, t);
      return { allowed: true, waitMs: 0 };
    },
    /* REAL ENFORCEMENT (worker.js), sketch:
       - track calls per user/IP in a KV/Durable Object with a rolling window
       - reject over-limit requests with 429 before they reach the paid provider
       This client guard and the server limit are complementary, not redundant. */
  };
}
