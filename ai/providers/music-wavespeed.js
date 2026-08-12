/**
 * Music Provider — WaveSpeedAI (Phase 2 reference implementation)
 * ==============================================================
 * This wraps the music call the app ALREADY makes (via worker.js) in the
 * MusicProvider interface. It proves the abstraction works against real, working
 * code — not a hypothetical. The app's existing callMusicAPI() logic lives here
 * now, behind a swappable interface.
 *
 * WRAPPER-SAFE: talks to the proxy by ABSOLUTE https URL (endpoint passed in),
 * uses only fetch + plain objects. Identical behaviour in browser and native shell.
 */

import { ok, fail } from '../interfaces.js';

/**
 * @param {{endpoint: string}} cfg  Absolute URL of the proxy /generate route.
 * @returns {import('../interfaces.js').MusicProvider}
 */
export function createWaveSpeedProvider(cfg) {
  const endpoint = cfg.endpoint; // e.g. https://musyx-api.you.workers.dev/generate

  return {
    info: {
      id: 'music-wavespeed',
      capability: 'music',
      label: 'WaveSpeedAI (LeVo / SongGeneration)',
      online: true,
      features: ['lyrics', 'poll', 'commercial'],
      endpoint,
    },

    /** Begin generation. Returns a job that may be immediately completed or pollable. */
    async start(req) {
      if (!endpoint) return fail('bad_request', 'no music endpoint configured', false);
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: req.prompt, lyrics: req.lyrics, genre: req.genre, durationSec: req.durationSec }),
          signal: req.signal,
        });
        if (r.status === 401 || r.status === 403) return fail('auth', 'music key rejected', false);
        if (r.status === 429) return fail('rate_limit', 'music provider rate limited', true);
        if (!r.ok) return fail('provider_down', 'music http ' + r.status, true);
        const data = await r.json();
        if (data.audioUrl) return ok({ status: 'completed', audioUrl: data.audioUrl });
        if (data.id || data.predictionId) {
          return ok({ status: 'processing', id: data.id || data.predictionId });
        }
        return fail('unknown', 'music provider returned no id or url', false);
      } catch (e) {
        // fetch throws on network loss — normalize to "offline" so the manager queues it
        return fail('offline', String(e && e.message || e), true);
      }
    },

    /** Poll a pollable job by id. */
    async poll(id) {
      if (!endpoint) return fail('bad_request', 'no music endpoint configured', false);
      try {
        const r = await fetch(endpoint + '?id=' + encodeURIComponent(id), { });
        if (!r.ok) return fail('provider_down', 'poll http ' + r.status, true);
        const d = await r.json();
        const url = d.audioUrl || (d.outputs && d.outputs[0]);
        if (url) return ok({ status: 'completed', id, audioUrl: url });
        if (d.status === 'failed') return ok({ status: 'failed', id });
        return ok({ status: 'processing', id });
      } catch (e) {
        return fail('offline', String(e && e.message || e), true);
      }
    },
  };
}
