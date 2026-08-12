/**
 * Music Provider — Suno (STUB, Phase 2)
 * =====================================
 * Purpose: demonstrate that adding a NEW music provider is a self-contained file
 * implementing the same MusicProvider interface — no change anywhere else. When
 * you get Suno access, fill in the two fetch calls and register it. To make Suno
 * the active provider, that's ONE line at startup:
 *     registry.setActive('music', 'music-suno');
 *
 * This stub is intentionally not wired up; it returns a clear "not configured"
 * error so it can be registered safely without breaking anything.
 */

import { fail } from '../interfaces.js';

/** @param {{endpoint?: string}} cfg */
export function createSunoProvider(cfg = {}) {
  const endpoint = cfg.endpoint || '';
  return {
    info: {
      id: 'music-suno',
      capability: 'music',
      label: 'Suno (not yet configured)',
      online: true,
      features: ['lyrics', 'poll'],
      endpoint,
    },
    async start(_req) {
      // TODO: POST to your Suno proxy route; return {status:'processing', id} or {status:'completed', audioUrl}
      return fail('bad_request', 'Suno provider not configured yet', false);
    },
    async poll(_id) {
      // TODO: GET your Suno proxy poll route
      return fail('bad_request', 'Suno provider not configured yet', false);
    },
  };
}
