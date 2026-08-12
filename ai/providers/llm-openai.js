/**
 * LLM Provider — OpenAI (Phase 2 reference implementation)
 * =======================================================
 * Implements LLMProvider by calling a proxy route (/llm) that holds the key.
 * The SAME pattern works for Claude, Gemini, Mistral — only the request/response
 * mapping differs, so each is a small sibling file. The app never knows which
 * one is active; it just asks the registry for "the LLM".
 *
 * WHY THROUGH A PROXY: an LLM key is as sensitive as a music key and must never
 * ship in the page. worker.js gains an /llm route (Phase 3) that forwards here.
 *
 * WRAPPER-SAFE: absolute endpoint URL, fetch + plain objects only.
 */

import { ok, fail } from '../interfaces.js';

/** @param {{endpoint: string, model?: string}} cfg */
export function createOpenAIProvider(cfg) {
  const endpoint = cfg.endpoint;          // e.g. https://musyx-api.you.workers.dev/llm
  const model = cfg.model || 'gpt-default';

  return {
    info: {
      id: 'llm-openai',
      capability: 'llm',
      label: 'OpenAI',
      online: true,
      features: ['json', 'system-prompt'],
      endpoint,
    },

    async complete(req) {
      if (!endpoint) return fail('bad_request', 'no llm endpoint configured', false);
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'openai',
            model,
            system: req.system,
            user: req.user,
            maxTokens: req.maxTokens,
            temperature: req.temperature,
            json: !!req.json,
          }),
          signal: req.signal,
        });
        if (r.status === 401 || r.status === 403) return fail('auth', 'llm key rejected', false);
        if (r.status === 429) return fail('rate_limit', 'llm rate limited', true);
        if (!r.ok) return fail('provider_down', 'llm http ' + r.status, true);

        const data = await r.json();
        const text = data.text || '';
        let parsed;
        if (req.json) {
          try { parsed = JSON.parse(stripFences(text)); } catch (_) { /* leave undefined */ }
        }
        return ok(
          { text, parsed },
          { provider: 'llm-openai', tokensIn: data.tokensIn, tokensOut: data.tokensOut }
        );
      } catch (e) {
        return fail('offline', String(e && e.message || e), true);
      }
    },
  };
}

/** Models sometimes wrap JSON in ```json fences; strip them before parsing. */
function stripFences(s) {
  return String(s).replace(/```json/gi, '').replace(/```/g, '').trim();
}
