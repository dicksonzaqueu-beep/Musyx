/**
 * Music Provider — Udio (STUB, Phase 6)
 * =====================================
 * Same MusicProvider interface as WaveSpeed. Not wired to a live key yet; it
 * returns a clean "not configured" error so it can be registered safely and used
 * as a fallback candidate. When you get Udio access, fill in the two fetch calls
 * and set its endpoint in bootstrap.js — nothing else in the app changes.
 *
 * Udio's notable capability differences vs. WaveSpeed are reflected in `features`
 * so the capability-aware selector (selectMusicProvider) can reason about it:
 *   - strong on full songs with lyrics and extend/remix
 * WRAPPER-SAFE: absolute endpoint URL, fetch + plain objects only.
 */

import { fail, ok } from '../interfaces.js';

/** @param {{endpoint?: string}} cfg */
export function createUdioProvider(cfg = {}) {
  const endpoint = cfg.endpoint || '';
  return {
    info: {
      id: 'music-udio',
      capability: 'music',
      label: endpoint ? 'Udio' : 'Udio (not configured)',
      online: true,
      // feature flags let the selector match jobs to capabilities
      features: ['lyrics', 'vocals', 'extend', 'remix', 'poll', 'commercial'],
      endpoint,
    },
    async start(req) {
      if (!endpoint) return fail('bad_request', 'Udio provider not configured yet', false);
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: req.prompt, lyrics: req.lyrics, genre: req.genre }),
          signal: req.signal,
        });
        if (r.status === 401 || r.status === 403) return fail('auth', 'udio key rejected', false);
        if (r.status === 429) return fail('rate_limit', 'udio rate limited', true);
        if (!r.ok) return fail('provider_down', 'udio http ' + r.status, true);
        const d = await r.json();
        if (d.audioUrl) return ok({ status: 'completed', audioUrl: d.audioUrl });
        if (d.id || d.jobId) return ok({ status: 'processing', id: d.id || d.jobId });
        return fail('unknown', 'udio returned no id or url', false);
      } catch (e) {
        return fail('offline', String((e && e.message) || e), true);
      }
    },
    async poll(id) {
      if (!endpoint) return fail('bad_request', 'Udio provider not configured yet', false);
      try {
        const r = await fetch(endpoint + '?id=' + encodeURIComponent(id));
        if (!r.ok) return fail('provider_down', 'udio poll http ' + r.status, true);
        const d = await r.json();
        const url = d.audioUrl || (d.outputs && d.outputs[0]);
        if (url) return ok({ status: 'completed', id, audioUrl: url });
        if (d.status === 'failed') return ok({ status: 'failed', id });
        return ok({ status: 'processing', id });
      } catch (e) {
        return fail('offline', String((e && e.message) || e), true);
      }
    },
  };
}
