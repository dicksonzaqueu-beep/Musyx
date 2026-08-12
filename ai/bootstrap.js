/**
 * Musyx AI Layer — Bootstrap / Composition Root (Phase 2)
 * =======================================================
 * This is the ONE place where concrete providers meet the registry. In
 * dependency-injection terms this is the "composition root": the single spot
 * that knows about real implementations. Everything else depends only on
 * interfaces resolved through the registry.
 *
 * To change what powers Musyx, you edit THIS FILE and nothing else:
 *   - add a provider   -> import it, registry.register(...)
 *   - switch primary   -> registry.setActive('music', 'music-suno')
 *   - reorder fallback -> order of registration
 *
 * index.html calls initAI(CONFIG) once at startup, passing the same CONFIG
 * object that already exists in the app (endpoints live there).
 */

import { registry } from './registry.js';
import { createWaveSpeedProvider } from './providers/music-wavespeed.js';
import { createSunoProvider } from './providers/music-suno.js';
import { createUdioProvider } from './providers/music-udio.js';
import { createStableAudioProvider } from './providers/music-stableaudio.js';
import { createOpenAIProvider } from './providers/llm-openai.js';
import { createCoverArtProvider } from './providers/image-coverart.js';

/**
 * Wire up providers from app config. Safe to call once at startup.
 * @param {{API_ENDPOINT?: string, LLM_ENDPOINT?: string}} CONFIG
 */
export function initAI(CONFIG = {}) {
  // --- Music providers ---
  // Primary: WaveSpeed (uses the existing music proxy the app already has).
  if (CONFIG.API_ENDPOINT) {
    registry.register(createWaveSpeedProvider({ endpoint: CONFIG.API_ENDPOINT }));
    // Fallback/example providers, registered but inactive. Only registered once a
    // real music endpoint exists so that pure DEMO mode (no endpoint) has zero
    // music providers and correctly uses the built-in demo tone. Each returns a
    // clean "not configured" error if activated without its own endpoint, and
    // shows the add-a-provider pattern. Their differing `features` power the
    // capability-aware selector (music-selector.js).
    registry.register(createSunoProvider({ endpoint: CONFIG.SUNO_ENDPOINT || '' }));
    registry.register(createUdioProvider({ endpoint: CONFIG.UDIO_ENDPOINT || '' }));
    registry.register(createStableAudioProvider({ endpoint: CONFIG.STABLEAUDIO_ENDPOINT || '' }));
  }

  // --- LLM providers ---
  // Only register if an LLM proxy route is configured; otherwise the app runs
  // its Phase-1 rule-based prompt path (no model calls), fully offline.
  if (CONFIG.LLM_ENDPOINT) {
    registry.register(createOpenAIProvider({ endpoint: CONFIG.LLM_ENDPOINT }));
    // Siblings (Claude/Gemini/Mistral) get added here as they're implemented;
    // registration order defines the fallback chain the manager will walk.
  }

  // --- Image providers (Phase 9 forward-compatibility) ---
  // Cover artwork. Dormant until an IMAGE_ENDPOINT is configured; proves the
  // ImageProvider seam works and shows where a real image model plugs in.
  if (CONFIG.IMAGE_ENDPOINT) {
    registry.register(createCoverArtProvider({ endpoint: CONFIG.IMAGE_ENDPOINT }));
  }

  return registry;
}

// Re-export for convenience so index.html can `import { registry, initAI }`.
export { registry };
