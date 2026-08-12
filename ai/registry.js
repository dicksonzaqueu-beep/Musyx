/**
 * Musyx AI Layer — Provider Registry & Dependency Injection (Phase 2)
 * ===================================================================
 * This is the mechanism that makes "no provider is hardcoded" literally true.
 *
 * The rest of the app NEVER imports a concrete provider. It asks the registry
 * for "the active LLM" or "the active music provider" and gets back whatever is
 * currently registered. Swapping OpenAI for Claude, or adding Suno, is done here
 * in one place — every consumer picks up the change for free.
 *
 * WHY A REGISTRY INSTEAD OF DIRECT IMPORTS?
 *   - Swappability: change providers without editing consumers (the whole point).
 *   - Testability: register a fake provider in a test; no network needed.
 *   - Fallback: register several providers per capability; the LLM Manager
 *     (Phase 3) walks the list in order when one fails.
 *   - Runtime safety: every provider is validated against its interface on
 *     registration (assertImplements), so a broken provider fails at startup.
 *
 * WHY THIS SHAPE OF "DEPENDENCY INJECTION"?
 *   Classic DI frameworks assume a build step and decorators. We have neither
 *   (plain files, no bundler, must run inside a WebView). So we use the simplest
 *   thing that gives the same benefit: a central container you register into and
 *   resolve out of. It is ~100 lines, has zero dependencies, and behaves
 *   identically in a browser and a Capacitor native shell.
 *
 * WRAPPER-SAFE: no DOM, no window.location, no cookies, no service-worker
 * assumptions. Pure data in, pure objects out.
 */

import { assertImplements } from './interfaces.js';

/**
 * Internal store. For each capability we keep an ORDERED list of providers
 * (first = primary, rest = fallbacks) plus a pointer to the active one.
 * @type {Record<string, {active: string|null, order: string[], byId: Record<string, any>}>}
 */
const _store = {
  llm: { active: null, order: [], byId: {} },
  music: { active: null, order: [], byId: {} },
  translation: { active: null, order: [], byId: {} },
  image: { active: null, order: [], byId: {} },
};

/** Simple event fan-out so UI can react to provider changes (e.g. update a badge). */
const _listeners = new Set();
function _emit(event) {
  for (const fn of _listeners) {
    try { fn(event); } catch (_) { /* a bad listener must never break the registry */ }
  }
}

export const registry = {
  /**
   * Register a provider. Validates it against its interface first.
   * The FIRST provider registered for a capability becomes active by default.
   * @param {{info: {id: string, capability: string}}} provider
   * @param {{makeActive?: boolean}=} opts
   */
  register(provider, opts = {}) {
    assertImplements(provider); // throws if malformed — fail loud, fail early
    const cap = provider.info.capability;
    const bucket = _store[cap];
    if (!bucket) throw new Error(`[AI] cannot register unknown capability "${cap}"`);
    const id = provider.info.id;

    if (!bucket.byId[id]) bucket.order.push(id);
    bucket.byId[id] = provider;

    const shouldActivate = opts.makeActive || bucket.active === null;
    if (shouldActivate) bucket.active = id;

    _emit({ type: 'register', capability: cap, id, active: bucket.active });
    return provider;
  },

  /**
   * Resolve the ACTIVE provider for a capability. This is what consumers call.
   * @param {'llm'|'music'|'translation'|'image'} capability
   * @returns {any|null}
   */
  get(capability) {
    const bucket = _store[capability];
    if (!bucket || !bucket.active) return null;
    return bucket.byId[bucket.active] || null;
  },

  /**
   * Get a specific provider by id (used by the manager for targeted fallback).
   * @param {string} capability @param {string} id
   */
  getById(capability, id) {
    return _store[capability]?.byId[id] || null;
  },

  /**
   * Get the ordered fallback chain for a capability: [primary, ...fallbacks].
   * The LLM Manager (Phase 3) walks this when the active provider fails.
   * @param {string} capability
   * @returns {any[]}
   */
  chain(capability) {
    const bucket = _store[capability];
    if (!bucket) return [];
    // active first, then the rest in registration order
    const ids = [bucket.active, ...bucket.order.filter((i) => i !== bucket.active)]
      .filter(Boolean);
    return ids.map((i) => bucket.byId[i]).filter(Boolean);
  },

  /**
   * Switch the active provider for a capability. One line = whole app switches.
   * @param {string} capability @param {string} id
   */
  setActive(capability, id) {
    const bucket = _store[capability];
    if (!bucket) throw new Error(`[AI] unknown capability "${capability}"`);
    if (!bucket.byId[id]) throw new Error(`[AI] provider "${id}" not registered for ${capability}`);
    bucket.active = id;
    _emit({ type: 'activate', capability, id });
  },

  /** List provider descriptors for a capability (for settings UIs, diagnostics). */
  list(capability) {
    const bucket = _store[capability];
    if (!bucket) return [];
    return bucket.order.map((id) => bucket.byId[id].info);
  },

  /** Snapshot of everything registered — handy for a diagnostics screen. */
  snapshot() {
    const out = {};
    for (const cap of Object.keys(_store)) {
      out[cap] = { active: _store[cap].active, providers: this.list(cap) };
    }
    return out;
  },

  /** Subscribe to registry changes. Returns an unsubscribe function. */
  onChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  /** Test helper: wipe everything. Not used in production paths. */
  _reset() {
    for (const cap of Object.keys(_store)) {
      _store[cap] = { active: null, order: [], byId: {} };
    }
  },
};
