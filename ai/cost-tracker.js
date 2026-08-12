/**
 * Musyx AI Layer — Cost & Token Monitor (Phase 8)
 * ================================================
 * The measurement backbone for cost optimization. It subscribes to the event
 * stream the LLM Manager already emits and accumulates estimated spend, token
 * usage, call counts, and cache savings — per provider and in total.
 *
 * WHY THIS IS THE HIGHEST-PRIORITY PIECE:
 *   Every other optimization (caching, batching, routing) is only worth doing if
 *   you can SEE its effect. This tracker turns the invisible ("are we spending too
 *   much on lyrics?") into a number you can act on. It saves nothing by itself —
 *   it's what lets you decide where saving is worth the effort.
 *
 * HONESTY ABOUT NUMBERS:
 *   Costs are ESTIMATES. Real per-call cost depends on live provider pricing and
 *   exact token counts, which change. Pricing is a config value YOU set (see
 *   PRICES below / passed in), never a hardcoded claim. Token counts come from the
 *   provider's own usage report via `meta`; when a provider doesn't report them,
 *   we fall back to a rough char/4 heuristic and flag the figure as approximate.
 *
 * WRAPPER-SAFE: pure in-memory accumulation + optional injected persist function.
 * No DOM, no direct storage, no network.
 */

/**
 * Default price table (USD). PLACEHOLDER VALUES — set real ones from your provider
 * dashboards. Music is per-run; LLM is per-1K-tokens (in/out).
 */
export const DEFAULT_PRICES = {
  music: { 'music-wavespeed': { perRun: 0.05 }, 'music-suno': { perRun: 0.00 }, 'music-udio': { perRun: 0.00 }, 'music-stableaudio': { perRun: 0.00 } },
  llm: { 'llm-openai': { per1kIn: 0.00015, per1kOut: 0.0006 } }, // example mini-model rates
};

/**
 * @param {{
 *   prices?: object,
 *   persist?: (snapshot: object) => void,   // optional: save totals to storage
 *   load?: () => object|null                 // optional: restore totals on boot
 * }=} opts
 */
export function createCostTracker(opts = {}) {
  const prices = opts.prices || DEFAULT_PRICES;

  const blank = () => ({
    calls: 0, cacheHits: 0, tokensIn: 0, tokensOut: 0,
    estCostUsd: 0, estSavedUsd: 0, approx: false,
  });

  // totals + per-provider breakdown
  const state = opts.load?.() || { total: blank(), byProvider: {} };

  const bucket = (id) => {
    if (!state.byProvider[id]) state.byProvider[id] = blank();
    return state.byProvider[id];
  };

  function priceLLM(id, tin, tout) {
    const p = prices.llm?.[id];
    if (!p) return { cost: 0, known: false };
    return { cost: (tin / 1000) * (p.per1kIn || 0) + (tout / 1000) * (p.per1kOut || 0), known: true };
  }
  function priceMusic(id) {
    const p = prices.music?.[id];
    if (!p) return { cost: 0, known: false };
    return { cost: p.perRun || 0, known: true };
  }

  /**
   * Record a successful AI call. Called from the manager's onEvent 'success', or
   * directly. `meta` carries provider + optional tokensIn/out.
   * @param {{capability:string, provider:string, tokensIn?:number, tokensOut?:number, chars?:number}} info
   */
  function recordCall(info) {
    const b = bucket(info.provider);
    b.calls++; state.total.calls++;

    if (info.capability === 'llm') {
      let tin = info.tokensIn, tout = info.tokensOut, approx = false;
      if (tin == null || tout == null) {
        // provider didn't report usage — rough estimate from chars (~4 chars/token)
        const approxTok = Math.ceil((info.chars || 0) / 4);
        tin = tin ?? approxTok; tout = tout ?? approxTok; approx = true;
      }
      b.tokensIn += tin; b.tokensOut += tout;
      state.total.tokensIn += tin; state.total.tokensOut += tout;
      const { cost, known } = priceLLM(info.provider, tin, tout);
      b.estCostUsd += cost; state.total.estCostUsd += cost;
      if (approx || !known) { b.approx = true; state.total.approx = true; }
    } else if (info.capability === 'music') {
      const { cost, known } = priceMusic(info.provider);
      b.estCostUsd += cost; state.total.estCostUsd += cost;
      if (!known) { b.approx = true; state.total.approx = true; }
    }
    opts.persist?.(snapshot());
  }

  /**
   * Record a cache hit — a call we DIDN'T make. Credits the estimated saving.
   * @param {{capability:string, provider:string, tokensIn?:number, tokensOut?:number}} info
   */
  function recordCacheHit(info) {
    const b = bucket(info.provider || 'cache');
    b.cacheHits++; state.total.cacheHits++;
    let saved = 0;
    if (info.capability === 'music') saved = priceMusic(info.provider).cost;
    else if (info.capability === 'llm') saved = priceLLM(info.provider, info.tokensIn || 0, info.tokensOut || 0).cost;
    b.estSavedUsd += saved; state.total.estSavedUsd += saved;
    opts.persist?.(snapshot());
  }

  /** Attach to a manager: subscribe to its event stream automatically. */
  function attachTo(manager, registryRef) {
    // The manager emits via the onEvent passed at construction; if you want the
    // tracker to auto-listen, route the manager's onEvent here (see bootstrap).
    return (evt) => {
      if (evt.type === 'success') {
        recordCall({
          capability: evt.capability,
          provider: evt.provider,
          tokensIn: evt.tokensIn,
          tokensOut: evt.tokensOut,
          chars: evt.chars,
        });
      } else if (evt.type === 'cache_hit') {
        recordCacheHit({ capability: evt.capability, provider: evt.provider, tokensIn: evt.tokensIn, tokensOut: evt.tokensOut });
      }
    };
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(state));
  }

  function reset() {
    state.total = blank();
    state.byProvider = {};
    opts.persist?.(snapshot());
  }

  /** Human-readable summary for a diagnostics line / console. */
  function summary() {
    const t = state.total;
    const tilde = t.approx ? '~' : '';
    return `${t.calls} calls, ${t.cacheHits} cache hits · est ${tilde}$${t.estCostUsd.toFixed(4)} spent, ${tilde}$${t.estSavedUsd.toFixed(4)} saved`;
  }

  return { recordCall, recordCacheHit, attachTo, snapshot, reset, summary, prices };
}
