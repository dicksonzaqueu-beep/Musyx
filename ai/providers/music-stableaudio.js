/**
 * Music Provider — Stable Audio (STUB, Phase 6)
 * =============================================
 * Same MusicProvider interface. Deliberately given DIFFERENT capability flags to
 * make the capability-aware selector meaningful: Stable Audio is strongest at
 * instrumental / sound-design and (in this stub's model) does NOT sing lyrics.
 * So `features` intentionally OMITS 'lyrics' and 'vocals'. The selector will
 * therefore avoid routing a "needs vocals" job here — demonstrating real
 * orchestration, not just a list of interchangeable endpoints.
 *
 * WRAPPER-SAFE: absolute endpoint URL, fetch + plain objects only.
 */

import { fail, ok } from '../interfaces.js';

/** @param {{endpoint?: string}} cfg */
export function createStableAudioProvider(cfg = {}) {
  const endpoint = cfg.endpoint || '';
  return {
    info: {
      id: 'music-stableaudio',
      capability: 'music',
      label: endpoint ? 'Stable Audio' : 'Stable Audio (not configured)',
      online: true,
      // note: no 'lyrics'/'vocals' — instrumental & sound-design strength
      features: ['instrumental', 'sfx', 'fast', 'poll'],
      endpoint,
    },
    async start(req) {
      if (!endpoint) return fail('bad_request', 'Stable Audio provider not configured yet', false);
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: req.prompt, durationSec: req.durationSec, genre: req.genre }),
          signal: req.signal,
        });
        if (r.status === 401 || r.status === 403) return fail('auth', 'stableaudio key rejected', false);
        if (r.status === 429) return fail('rate_limit', 'stableaudio rate limited', true);
        if (!r.ok) return fail('provider_down', 'stableaudio http ' + r.status, true);
        const d = await r.json();
        if (d.audioUrl) return ok({ status: 'completed', audioUrl: d.audioUrl });
        if (d.id) return ok({ status: 'processing', id: d.id });
        return fail('unknown', 'stableaudio returned no id or url', false);
      } catch (e) {
        return fail('offline', String((e && e.message) || e), true);
      }
    },
    async poll(id) {
      if (!endpoint) return fail('bad_request', 'Stable Audio provider not configured yet', false);
      try {
        const r = await fetch(endpoint + '?id=' + encodeURIComponent(id));
        if (!r.ok) return fail('provider_down', 'stableaudio poll http ' + r.status, true);
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
