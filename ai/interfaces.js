/**
 * Musyx AI Layer — Provider Interfaces (Phase 2)
 * ================================================
 * These are the CONTRACTS every AI provider must satisfy. They are written as
 * JSDoc "typedefs" plus a runtime validator, so we get:
 *   - documentation and editor autocomplete (via JSDoc), and
 *   - a real runtime check (via assertImplements) that a provider is well-formed,
 * WITHOUT introducing TypeScript or any build step. This keeps the app deployable
 * as plain files on GitHub Pages and identical inside a native (Capacitor) wrapper.
 *
 * DESIGN RULE: nothing here touches the DOM, window.location, cookies, or the
 * service worker. Every method takes plain data in and returns plain data out.
 * That is what makes the whole layer "wrapper-safe": the exact same code runs in
 * a browser tab and inside an iOS/Android WebView with no changes.
 *
 * A "provider" is a small object that knows how to do ONE capability
 * (talk to an LLM, generate music, translate text, ...). Providers are
 * interchangeable: the rest of the app depends on the INTERFACE, never on a
 * concrete provider. Swapping OpenAI for Claude, or WaveSpeed for Suno, is a
 * one-line registry change (see registry.js).
 */

/* ------------------------------------------------------------------ *
 * Shared shapes
 * ------------------------------------------------------------------ */

/**
 * Result envelope returned by every provider call. We never throw across the
 * boundary for *expected* failures (offline, provider down, quota) — we return
 * a structured result so the LLM Manager (Phase 3) can decide to retry, fall
 * back, or queue. Unexpected programming errors may still throw.
 *
 * @template T
 * @typedef {Object} AIResult
 * @property {boolean} ok            Did the call succeed?
 * @property {T=} data              The payload when ok === true.
 * @property {AIError=} error       Structured error when ok === false.
 * @property {ProviderMeta=} meta   Bookkeeping: which provider, latency, tokens.
 */

/**
 * @typedef {Object} AIError
 * @property {'offline'|'auth'|'rate_limit'|'timeout'|'provider_down'|'bad_request'|'unknown'} kind
 *           A normalized reason, so the manager reacts to categories, not raw strings.
 * @property {string} message       Human-readable detail (safe to log).
 * @property {boolean} retryable    Hint: is retrying this same provider worthwhile?
 */

/**
 * @typedef {Object} ProviderMeta
 * @property {string} provider      Provider id, e.g. "llm-openai".
 * @property {number=} latencyMs    Round-trip time, filled by the manager.
 * @property {number=} tokensIn     Prompt tokens, if the provider reports them.
 * @property {number=} tokensOut    Completion tokens, if reported.
 * @property {number=} costUsd      Estimated cost, if known (feeds Phase 8).
 */

/**
 * Every provider carries a capability descriptor so the app can reason about
 * what it can and cannot do (e.g. gray out "stems" if the music provider
 * can't produce them). This is the "capabilities manifest" flagged in Phase 1.
 *
 * @typedef {Object} ProviderInfo
 * @property {string} id            Unique id, e.g. "music-wavespeed".
 * @property {'llm'|'music'|'translation'|'image'} capability
 * @property {string} label         Human label, e.g. "WaveSpeedAI (LeVo)".
 * @property {boolean} online       Requires network? (music/LLM = true; a future
 *                                  on-device model = false).
 * @property {string[]} features    Free-form flags, e.g. ["lyrics","stems","poll"].
 * @property {string=} endpoint     The proxy route this provider calls, if any.
 */

/* ------------------------------------------------------------------ *
 * Interface 1 — LLMProvider  (text intelligence: prompts, lyrics, etc.)
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} LLMRequest
 * @property {string} system        System instruction (role/behaviour).
 * @property {string} user          The user/content message.
 * @property {number=} maxTokens    Upper bound on output length.
 * @property {number=} temperature  Creativity 0..1.
 * @property {boolean=} json        If true, ask the model for strict JSON.
 * @property {AbortSignal=} signal   Lets the manager cancel/timeout the call.
 */

/**
 * @typedef {Object} LLMResponse
 * @property {string} text          The model's text output.
 * @property {Object=} parsed       Parsed JSON when request.json === true.
 */

/**
 * LLMProvider — the contract for any large-language-model backend
 * (OpenAI, Claude, Gemini, Mistral, or a future local model).
 *
 * @typedef {Object} LLMProvider
 * @property {ProviderInfo} info
 * @property {(req: LLMRequest) => Promise<AIResult<LLMResponse>>} complete
 *           Send one request, get one result. Stateless: all context must be in req.
 */

/* ------------------------------------------------------------------ *
 * Interface 2 — MusicProvider  (audio generation)
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} MusicRequest
 * @property {string} prompt        The final music prompt string.
 * @property {string=} lyrics       Optional lyrics to sing.
 * @property {string=} genre        Optional explicit genre hint.
 * @property {number=} durationSec  Desired length.
 * @property {AbortSignal=} signal
 */

/**
 * @typedef {Object} MusicJob
 * @property {'queued'|'processing'|'completed'|'failed'} status
 * @property {string=} id           Provider job id (for pollable providers).
 * @property {string=} audioUrl     Final audio URL when completed.
 */

/**
 * MusicProvider — the contract for any music backend (WaveSpeed today; Suno,
 * Udio, Stable Audio as stubs). Two methods cover both response styles:
 * providers that return a URL immediately, and providers that return a job id
 * you must poll. A provider that returns immediately just resolves `poll` from
 * cache; a pollable one implements both. The manager treats them uniformly.
 *
 * @typedef {Object} MusicProvider
 * @property {ProviderInfo} info
 * @property {(req: MusicRequest) => Promise<AIResult<MusicJob>>} start
 *           Begin generation. Returns a job (possibly already completed).
 * @property {(id: string) => Promise<AIResult<MusicJob>>} poll
 *           Check a job's status. No-op-return for immediate providers.
 */

/* ------------------------------------------------------------------ *
 * Interface 3 — TranslationProvider  (content translation)
 * ------------------------------------------------------------------ */

/**
 * NOTE: this translates CONTENT (lyrics, prompts), not the UI. The UI keeps its
 * static PT/EN dictionaries. Kept separate on purpose so a cheap/free translator
 * can serve content while UI strings stay instant and offline.
 *
 * @typedef {Object} TranslationRequest
 * @property {string} text
 * @property {string} to            Target language code, e.g. "en", "pt".
 * @property {string=} from         Source; omit to auto-detect.
 * @property {AbortSignal=} signal
 */

/**
 * @typedef {Object} TranslationResponse
 * @property {string} text          Translated text.
 * @property {string=} detectedFrom Detected source language, if auto-detected.
 */

/**
 * @typedef {Object} TranslationProvider
 * @property {ProviderInfo} info
 * @property {(req: TranslationRequest) => Promise<AIResult<TranslationResponse>>} translate
 */

/* ------------------------------------------------------------------ *
 * Interface 4 — ImageProvider  (FUTURE: cover artwork; stub only)
 * ------------------------------------------------------------------ */

/**
 * Defined now so the registry and manager already know the shape; no concrete
 * implementation ships in this phase. This is how "design for the future"
 * becomes real instead of a promise: the seam exists, empty.
 *
 * @typedef {Object} ImageRequest
 * @property {string} prompt
 * @property {('1:1'|'16:9'|'9:16')=} aspect
 * @property {AbortSignal=} signal
 */

/**
 * @typedef {Object} ImageResponse
 * @property {string} imageUrl
 */

/**
 * @typedef {Object} ImageProvider
 * @property {ProviderInfo} info
 * @property {(req: ImageRequest) => Promise<AIResult<ImageResponse>>} generate
 */

/* ------------------------------------------------------------------ *
 * Runtime contract validation
 * ------------------------------------------------------------------ */

/**
 * The required method names for each capability. assertImplements() checks a
 * provider actually has them before we register it — so a malformed provider
 * fails loudly at startup, not silently at generation time in front of a founder.
 */
export const REQUIRED_METHODS = {
  llm: ['complete'],
  music: ['start', 'poll'],
  translation: ['translate'],
  image: ['generate'],
};

/**
 * Helper for building the standard result envelope, so every provider returns
 * the same shape without repeating boilerplate.
 * @template T
 * @param {T} data
 * @param {ProviderMeta=} meta
 * @returns {AIResult<T>}
 */
export const ok = (data, meta) => ({ ok: true, data, meta });

/**
 * @param {AIError['kind']} kind
 * @param {string} message
 * @param {boolean=} retryable
 * @returns {AIResult<never>}
 */
export const fail = (kind, message, retryable = false) => ({
  ok: false,
  error: { kind, message, retryable },
});

/**
 * Validate that `provider` satisfies its declared capability's interface.
 * Throws a clear error if not. Called by the registry on registration.
 * @param {{info: ProviderInfo}} provider
 */
export function assertImplements(provider) {
  if (!provider || !provider.info) {
    throw new Error('[AI] provider missing .info descriptor');
  }
  const { id, capability } = provider.info;
  const required = REQUIRED_METHODS[capability];
  if (!required) {
    throw new Error(`[AI] provider "${id}" has unknown capability "${capability}"`);
  }
  for (const method of required) {
    if (typeof provider[method] !== 'function') {
      throw new Error(
        `[AI] provider "${id}" (${capability}) is missing required method "${method}()"`
      );
    }
  }
  return true;
}
