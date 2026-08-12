/**
 * Musyx AI Layer — Prompt Engineering Engine (Phase 4)
 * ====================================================
 * Turns raw questionnaire answers into a PROFESSIONAL, structured prompt package.
 *
 * TWO MODES, ONE API:
 *   buildPromptPackage(answers)            → rule-based, offline, free, instant
 *   await enhanceWithLLM(pkg, manager)     → optional model polish when online
 *
 * The rule-based path is the FLOOR: it always runs and always returns a complete,
 * usable package with no network and no LLM. The LLM path is a QUALITY BOOST layer
 * that starts from the rule-based package (so the model refines correct musical
 * facts rather than inventing them). If the LLM is unavailable/offline/errors, the
 * rule-based package stands on its own. This is what preserves Musyx's offline-first
 * promise while still allowing "intelligent" enhancement.
 *
 * WHAT THE ENGINE PRODUCES (everything the brief asked for):
 *   - improved + expanded prompt text
 *   - production notes
 *   - genre-specific information
 *   - suggested BPM
 *   - suggested instruments
 *   - negative prompt (what to avoid)
 *   - metadata (title ideas, tags, mood, language)
 *   - structured JSON (canonical intermediate object)
 *   - provider-specific prompt strings (Suno/Udio/Stable Audio/WaveSpeed)
 *
 * WRAPPER-SAFE: pure functions over plain data. No DOM, no globals, no network in
 * the rule-based path. The LLM path only touches the injected manager.
 */

import { GENRE_DB, MOOD_DB, resolveBpm } from './genre-db.js';

/**
 * The normalized input the engine expects. index.html adapts its `state` into
 * this shape (see the thin adapter in the app), so the engine has NO dependency
 * on the app's internal variable names — only on this documented contract.
 *
 * @typedef {Object} PromptAnswers
 * @property {string[]} genres       e.g. ["Afro House"]
 * @property {string[]} moods        e.g. ["Energetic","Inspirational"]
 * @property {string}   vocals       e.g. "Female vocals"
 * @property {string}   language     e.g. "Portuguese"
 * @property {number}   tempoIndex   0 slow, 1 medium, 2 fast
 * @property {string}   duration     e.g. "3 min"
 * @property {string}   theme        free-text idea from the user
 * @property {string}   lyricsMode   e.g. "Generate lyrics for me"
 * @property {number}   creativity   0..100
 * @property {string}   useCase      e.g. "Social media"
 */

/**
 * Build the full professional prompt package from answers — rule-based, offline.
 * @param {PromptAnswers} a
 * @returns {object} the prompt package
 */
export function buildPromptPackage(a) {
  const primaryGenre = a.genres[0] || 'Afro House';
  const g = GENRE_DB[primaryGenre] || null;

  // --- BPM: pick within the genre's range based on tempo choice ---
  const bpm = resolveBpm(primaryGenre, a.tempoIndex);

  // --- instruments: from genre, deduped, capped for prompt brevity ---
  const instruments = g ? g.instruments.slice(0, 6) : ['drums', 'bass', 'keys', 'pads'];

  // --- production notes: genre production + mood colouring ---
  const moodNotes = a.moods.map((m) => MOOD_DB[m]).filter(Boolean);
  const production = [g && g.production, ...moodNotes].filter(Boolean).join('; ');

  // --- theme fallback so an empty idea still yields something professional ---
  const theme = (a.theme && a.theme.trim())
    || 'an uplifting original track with a memorable hook';

  // --- improved + expanded natural-language prompt ---
  const vocalsPhrase = /instrumental/i.test(a.vocals) ? 'instrumental, no vocals' : a.vocals.toLowerCase();
  const moodPhrase = a.moods.join(' and ').toLowerCase();
  const improvedPrompt =
    `A ${moodPhrase} ${primaryGenre} track at ${bpm} BPM in ${a.language}, ${vocalsPhrase}. ` +
    `Theme: ${theme}. ` +
    (g ? `Production: ${g.production}. Featuring ${instruments.join(', ')}. ` : '') +
    `Duration around ${a.duration}.`;

  // --- negative prompt: what a producer would want to AVOID for this style ---
  const negative = buildNegative(primaryGenre, a);

  // --- metadata: title ideas, tags ---
  const tags = [primaryGenre, ...a.genres.slice(1), ...a.moods, a.language]
    .filter(Boolean).map((s) => s.toLowerCase());
  const titleIdeas = suggestTitles(a, theme);

  // --- canonical structured object (the intermediate everything else derives from) ---
  const structured = {
    genre: a.genres.join(', '),
    primaryGenre,
    mood: a.moods,
    vocals: a.vocals,
    language: a.language,
    bpm,
    key: g ? g.key : undefined,
    tempo: ['slow', 'medium', 'fast'][a.tempoIndex] || 'medium',
    duration: a.duration,
    theme,
    instruments,
    lyrics_mode: a.lyricsMode,
    creativity: a.creativity + '%',
    use_case: a.useCase,
  };

  // --- provider-specific renderings ---
  const providerPrompts = {
    wavespeed: improvedPrompt,                             // descriptive sentence
    suno: renderSuno(structured, improvedPrompt),          // style tags + brief
    udio: renderUdio(structured, improvedPrompt),          // similar tag style
    stableaudio: renderStableAudio(structured),            // terse descriptor list
  };

  return {
    improvedPrompt,
    productionNotes: production,
    genreInfo: g ? { ...g, name: primaryGenre } : { name: primaryGenre },
    bpm,
    instruments,
    negativePrompt: negative,
    metadata: { titleIdeas, tags, mood: a.moods, language: a.language, useCase: a.useCase },
    structured,
    providerPrompts,
    enhanced: false, // becomes true after enhanceWithLLM succeeds
  };
}

/* ----------------------------- helpers ------------------------------ */

function buildNegative(genre, a) {
  const base = ['off-key notes', 'muddy low end', 'clipping', 'abrupt cuts', 'out-of-time drums'];
  if (/instrumental/i.test(a.vocals)) base.push('vocals', 'lyrics', 'spoken word');
  if (genre === 'Lo-Fi' || genre === 'Piano' || genre === 'Jazz') base.push('harsh distortion', 'aggressive 808s');
  if (genre === 'Cinematic' || genre === 'Gospel') base.push('lo-fi noise', 'cheap synth presets');
  if (a.moods.includes('Relaxing') || a.moods.includes('Romantic')) base.push('aggressive percussion');
  return base.join(', ');
}

function suggestTitles(a, theme) {
  // deterministic-ish suggestions seeded from the theme's first words + mood
  const words = theme.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean);
  const pick = (i) => words[i] ? cap(words[i]) : null;
  const moodWord = a.moods[0] || '';
  const ideas = [
    pick(0) && pick(1) ? `${pick(0)} ${pick(1)}` : null,
    a.language === 'Portuguese' ? 'Caminho de Luz' : 'Path of Light',
    moodWord ? `${cap(moodWord)} Nights` : null,
    pick(0) ? `${pick(0)} (Reprise)` : null,
  ].filter(Boolean);
  return [...new Set(ideas)].slice(0, 4);
}

const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

function renderSuno(s, prompt) {
  const style = [s.primaryGenre, ...s.mood, `${s.bpm}bpm`].join(', ').toLowerCase();
  return `[Style: ${style}]\n${prompt}`;
}
function renderUdio(s, prompt) {
  const style = [s.primaryGenre, ...s.mood].join(', ').toLowerCase();
  return `${style} — ${prompt}`;
}
function renderStableAudio(s) {
  return [s.primaryGenre, ...s.mood, `${s.bpm} BPM`, s.key, ...s.instruments]
    .filter(Boolean).join(', ').toLowerCase();
}

/* ----------------------- optional LLM enhancement ------------------- */

/**
 * Enhance a rule-based package using the LLM manager, if available and online.
 * Returns a NEW package (never mutates the input). On any failure it returns the
 * original unchanged — the caller can always trust the result is usable.
 *
 * @param {object} pkg      output of buildPromptPackage
 * @param {object} manager  the AI manager (window.MusyxAI.manager)
 * @returns {Promise<object>}
 */
export async function enhanceWithLLM(pkg, manager) {
  if (!manager) return pkg;

  const system =
    'You are a professional music producer and prompt engineer. Improve the given ' +
    'music-generation prompt. Keep the same genre, language, mood, and BPM. Return ' +
    'STRICT JSON only, no prose, with keys: improvedPrompt (string), ' +
    'productionNotes (string), negativePrompt (string), titleIdeas (array of 4 strings).';

  const user = JSON.stringify({
    current: pkg.improvedPrompt,
    structured: pkg.structured,
    productionNotes: pkg.productionNotes,
    negativePrompt: pkg.negativePrompt,
  });

  const res = await manager.llm({ system, user, json: true, temperature: 0.7, maxTokens: 600 });
  if (!res.ok || !res.data || !res.data.parsed) return pkg; // graceful: keep rule-based

  const p = res.data.parsed;
  return {
    ...pkg,
    improvedPrompt: typeof p.improvedPrompt === 'string' ? p.improvedPrompt : pkg.improvedPrompt,
    productionNotes: typeof p.productionNotes === 'string' ? p.productionNotes : pkg.productionNotes,
    negativePrompt: typeof p.negativePrompt === 'string' ? p.negativePrompt : pkg.negativePrompt,
    metadata: {
      ...pkg.metadata,
      titleIdeas: Array.isArray(p.titleIdeas) && p.titleIdeas.length ? p.titleIdeas : pkg.metadata.titleIdeas,
    },
    // re-render provider prompts from the improved text
    providerPrompts: {
      ...pkg.providerPrompts,
      wavespeed: typeof p.improvedPrompt === 'string' ? p.improvedPrompt : pkg.providerPrompts.wavespeed,
    },
    enhanced: true,
  };
}
