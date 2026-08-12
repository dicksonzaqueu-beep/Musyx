/**
 * Image Provider — Cover Artwork (STUB, Phase 9)
 * ===============================================
 * Activates the ImageProvider interface defined back in Phase 2 — proving the
 * seam is real, not hypothetical. This is a concrete forward-compatibility
 * demonstration: adding a whole NEW capability (image generation for cover art)
 * is the same one-file + one-registration pattern as adding a music provider.
 *
 * Not wired to a live image API. It returns a clean "not configured" error, so it
 * registers safely and shows exactly where a real provider (e.g. an image model
 * behind your worker's future /image route) would slot in.
 *
 * WRAPPER-SAFE: absolute endpoint URL, fetch + plain objects only.
 */

import { fail, ok } from '../interfaces.js';

/** @param {{endpoint?: string}} cfg */
export function createCoverArtProvider(cfg = {}) {
  const endpoint = cfg.endpoint || '';
  return {
    info: {
      id: 'image-coverart',
      capability: 'image',
      label: endpoint ? 'Cover Artwork' : 'Cover Artwork (not configured)',
      online: true,
      features: ['cover', 'square', '1:1'],
      endpoint,
    },
    async generate(req) {
      if (!endpoint) return fail('bad_request', 'Cover art provider not configured yet', false);
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: req.prompt, aspect: req.aspect || '1:1' }),
          signal: req.signal,
        });
        if (r.status === 401 || r.status === 403) return fail('auth', 'image key rejected', false);
        if (r.status === 429) return fail('rate_limit', 'image rate limited', true);
        if (!r.ok) return fail('provider_down', 'image http ' + r.status, true);
        const d = await r.json();
        if (d.imageUrl) return ok({ imageUrl: d.imageUrl }, { provider: 'image-coverart' });
        return fail('unknown', 'image provider returned no url', false);
      } catch (e) {
        return fail('offline', String((e && e.message) || e), true);
      }
    },
  };
}
