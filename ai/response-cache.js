/**
 * Musyx AI Layer — Response Cache (Phase 8)
 * ==========================================
 * The single biggest cost lever: an identical request returns a stored result
 * instead of a paid API call. Reuses the same stable fingerprint the queue
 * manager uses, so "same work" is defined consistently across the whole layer.
 *
 * WHY THIS MATTERS FOR MUSYX:
 *   - Cost: a repeated prompt/lyric/translation costs $0 the second time.
 *   - Offline: cache reads from local storage, so a previously-generated result
 *     is available with no connection — reinforcing the offline-first promise.
 *   - Speed: instant instead of a multi-second (or multi-minute music) wait.
 *
 * SCOPE (as agreed): EXACT-match caching only. Semantic / "similar prompt" reuse
 * is deliberately left as a documented extension (see SEMANTIC-REUSE note at the
 * bottom) because fuzzy matching without measurement risks serving a subtly wrong
 * result. Exact match is safe, simple, and captures the common real cases
 * (regenerate, back-and-forth, demoing the same song).
 *
 * WHAT WE CACHE:
 *   - llm completions (prompt enhancement, lyrics, translation) — cheap, high reuse
 *   - music results (the audio URL) — expensive, so even rare reuse pays off
 * WHAT WE DON'T CACHE:
 *   - anything with an explicit noCache flag (e.g. "alternate version", which is
 *     meant to differ every time)
 *
 * WRAPPER-SAFE: storage is INJECTED (same IndexedDB adapter pattern). No DOM,
 * no direct IndexedDB, no globals. TTL + LRU-ish cap keep it bounded.
 */

import { fingerprint } from './queue-manager.js';

const DEFAULTS = {
  ttlMs: 1000 * 60 * 60 * 24 * 30, // 30 days
  maxEntries: 200,                 // cap so the cache can't grow unbounded
};

/**
 * @param {{
 *   store: {
 *     all: () => Promise<any[]>,
 *     put: (entry: any) => Promise<any>,
 *     del: (key: string) => Promise<void>,
 *   },
 *   now?: () => number,
 *   onEvent?: (e: any) => void,
 *   config?: Partial<typeof DEFAULTS>
 * }} deps
 */
export function createResponseCache(deps) {
  const cfg = { ...DEFAULTS, ...(deps.config || {}) };
  const now = deps.now || (() => Date.now());
  const emit = (e) => { try { deps.onEvent && deps.onEvent(e); } catch (_) {} };

  const keyFor = (capability, payload) => 'cache_' + capability + '_' + fingerprint(capability, payload);

  /**
   * Look up a cached result. Returns the stored `data` or null. Expired entries
   * are treated as misses (and cleaned).
   */
  async function get(capability, payload) {
    const key = keyFor(capability, payload);
    const all = await deps.store.all();
    const hit = all.find((e) => e.key === key);
    if (!hit) { emit({ type: 'cache_miss', capability }); return null; }
    if (hit.expiresAt && hit.expiresAt < now()) {
      await deps.store.del(key);
      emit({ type: 'cache_expired', capability });
      return null;
    }
    // touch for LRU-ish recency
    hit.lastUsed = now();
    await deps.store.put(hit);
    emit({ type: 'cache_hit', capability, provider: hit.provider, tokensIn: hit.tokensIn, tokensOut: hit.tokensOut });
    return hit.data;
  }

  /** Store a result. `meta` (provider, tokens) is kept so cost-saving can be credited. */
  async function set(capability, payload, data, meta = {}) {
    const key = keyFor(capability, payload);
    const entry = {
      key, capability, data,
      provider: meta.provider, tokensIn: meta.tokensIn, tokensOut: meta.tokensOut,
      created: now(), lastUsed: now(), expiresAt: now() + cfg.ttlMs,
    };
    await deps.store.put(entry);
    await evictIfNeeded();
    emit({ type: 'cache_store', capability });
    return entry;
  }

  /** Bound the cache: if over cap, drop the least-recently-used entries. */
  async function evictIfNeeded() {
    const all = await deps.store.all();
    if (all.length <= cfg.maxEntries) return;
    all.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0)); // oldest use first
    const remove = all.slice(0, all.length - cfg.maxEntries);
    for (const e of remove) await deps.store.del(e.key);
    emit({ type: 'cache_evict', count: remove.length });
  }

  /**
   * Convenience wrapper: return cached result if present, else run `producer()`,
   * cache its result, and return it. `producer` must return the manager's
   * AIResult ({ ok, data, meta }). Only successful results are cached.
   *
   * @param {string} capability
   * @param {any} payload
   * @param {() => Promise<{ok:boolean, data?:any, meta?:any}>} producer
   * @param {{noCache?: boolean}=} o
   */
  async function wrap(capability, payload, producer, o = {}) {
    if (o.noCache) return producer();
    const cached = await get(capability, payload);
    if (cached != null) return { ok: true, data: cached, meta: { cached: true } };
    const res = await producer();
    if (res && res.ok && res.data != null) {
      await set(capability, payload, res.data, res.meta || {});
    }
    return res;
  }

  async function clear() {
    const all = await deps.store.all();
    for (const e of all) await deps.store.del(e.key);
    emit({ type: 'cache_clear' });
  }

  async function stats() {
    const all = await deps.store.all();
    return { entries: all.length, maxEntries: cfg.maxEntries };
  }

  return { get, set, wrap, clear, stats, keyFor };
}

/*
 * SEMANTIC-REUSE (documented extension, intentionally NOT built now)
 * -----------------------------------------------------------------
 * A future upgrade: instead of exact-match, embed each prompt and reuse a cached
 * result when a new prompt is "close enough" (cosine similarity over embeddings
 * above a threshold). This can cut cost further but requires:
 *   - an embedding call (itself a cost) or an on-device embedding model,
 *   - a similarity threshold tuned against measured quality, and
 *   - a way to detect when reuse produced a subtly wrong result.
 * Do this only after the cost monitor shows exact-match caching isn't enough AND
 * you have quality measurement in place — otherwise it trades money for silent
 * wrongness. The exact-match cache above is the safe floor.
 */
