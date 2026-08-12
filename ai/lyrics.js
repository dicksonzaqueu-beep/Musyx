/**
 * Musyx AI Layer — Lyrics Intelligence (Phase 5)
 * ===============================================
 * Generates and works with song lyrics. Like the prompt engine, it has a
 * rule-based FLOOR that always works offline and for free, and an LLM path that
 * produces real, original lyrics when configured and online.
 *
 * INTEGRATED-INTO-THE-FLOW (the approach you approved):
 *   generateLyrics(answers, manager) is called automatically when a song is
 *   finalized. If the LLM is available it returns AI-written lyrics; otherwise it
 *   returns a clean, structured rule-based placeholder that clearly reads as a
 *   placeholder (never pretends a model wrote it). Either way the results page
 *   shows lyrics and they are persisted locally with the song.
 *
 * CAPABILITIES (all the brief listed), exposed as small pure-ish functions:
 *   generateLyrics   — make lyrics from the questionnaire answers
 *   improveLyrics    — polish existing lyrics (LLM)
 *   translateLyrics  — translate to another language (LLM, or passthrough offline)
 *   analyzeStructure — detect verses / chorus offline (no model needed)
 *   suggestRhymes    — rhyme-improvement suggestions (LLM)
 *   alternateVersion — produce a different take (LLM)
 *
 * PROMPT DESIGN (why the prompts look the way they do):
 *   - We always pin genre, language, mood and theme so the model can't drift.
 *   - We request an explicit [Verse]/[Chorus] tag format so downstream structure
 *     detection is reliable and providers like Suno accept it directly.
 *   - We cap length (maxTokens) to control cost and latency — lyrics are short.
 *
 * TOKEN USAGE / PERFORMANCE (documented for the brief):
 *   - A full lyric generation is small: ~150 prompt tokens + ~300 completion
 *     tokens typical. At commodity mini-model rates that's a fraction of a cent.
 *   - analyzeStructure is FREE (pure string parsing, no tokens, instant, offline).
 *   - improve/translate/rhyme/alternate reuse the SAME lyrics as context, so we
 *     never re-send the questionnaire — keeps each follow-up call cheap.
 *   - All calls run through the LLM Manager, so they inherit retry + fallback +
 *     offline queueing for free.
 *
 * WRAPPER-SAFE: pure data in/out; only the injected manager touches the network.
 */

/**
 * @typedef {import('./prompt-engine.js').PromptAnswers} PromptAnswers
 */

/**
 * Generate lyrics for a song. Returns { text, source, structure }.
 *   source: 'ai' when the LLM wrote them, 'placeholder' when rule-based.
 * Never throws — always returns usable lyrics.
 *
 * @param {PromptAnswers} answers
 * @param {object|null} manager      window.MusyxAI.manager (may be null/offline)
 * @param {{isInstrumental?: boolean}=} opts
 */
export async function generateLyrics(answers, manager, opts = {}) {
  // Instrumental tracks legitimately have no lyrics.
  if (opts.isInstrumental || /instrumental/i.test(answers.vocals || '')) {
    return { text: '', source: 'instrumental', structure: [] };
  }

  // Try the AI path when a manager exists (it self-checks online/configured).
  if (manager) {
    const ai = await tryGenerateWithLLM(answers, manager);
    if (ai) return { text: ai, source: 'ai', structure: analyzeStructure(ai) };
  }

  // Rule-based placeholder floor — clearly labeled, structured, on-theme.
  const placeholder = buildPlaceholder(answers);
  return { text: placeholder, source: 'placeholder', structure: analyzeStructure(placeholder) };
}

async function tryGenerateWithLLM(a, manager) {
  const system =
    'You are a professional songwriter. Write original song lyrics. Match the ' +
    'language, genre, and mood exactly. Use clear [Verse], [Chorus], [Bridge] ' +
    'section tags. Keep it concise: 1-2 verses, one chorus. Do NOT add commentary.';
  const user = JSON.stringify({
    language: a.language, genre: a.genres?.[0], mood: a.moods,
    theme: a.theme || 'an uplifting original song',
  });
  const res = await manager.llm({ system, user, temperature: 0.9, maxTokens: 400 });
  if (res.ok && res.data && res.data.text && res.data.text.trim().length > 20) {
    return res.data.text.trim();
  }
  return null; // fall back to placeholder
}

/**
 * Rule-based placeholder. Deterministic, on-theme, and honestly labeled so no one
 * mistakes it for AI-written output. Structured with real section tags so the
 * results screen and structure detection behave the same as the AI path.
 * @param {PromptAnswers} a
 */
function buildPlaceholder(a) {
  const pt = (a.language === 'Portuguese');
  const theme = (a.theme && a.theme.trim()) || (pt ? 'a nossa história' : 'our story');
  const mood = (a.moods && a.moods[0]) || '';
  if (pt) {
    return (
      `[verse]\n` +
      `Levanto os olhos e vejo ${theme}\n` +
      `Sinto a força a crescer dentro de mim\n` +
      `Cada momento é um novo começo\n\n` +
      `[chorus]\n` +
      `${theme} — a nossa melodia\n` +
      `Cantamos juntos, noite e dia\n` +
      `Nada nos pode parar agora\n\n` +
      `[verse]\n` +
      `O ritmo leva-nos para bem longe\n` +
      `Com a energia que enche o ar`
    );
  }
  return (
    `[verse]\n` +
    `I lift my eyes and I can see ${theme}\n` +
    `Feeling the fire rising up in me\n` +
    `Every moment is a brand new start\n\n` +
    `[chorus]\n` +
    `${theme} — this is our song\n` +
    `We sing together, all night long\n` +
    `Nothing can stop us now\n\n` +
    `[verse]\n` +
    `The rhythm carries us far away\n` +
    `With the energy filling the air`
  );
}

/**
 * Detect verses / chorus / bridge WITHOUT a model. Parses [Section] tags, and if
 * none exist, falls back to blank-line stanza splitting with a heuristic that a
 * repeated stanza is the chorus. Free, instant, offline.
 *
 * @param {string} text
 * @returns {{type: string, label: string, lines: string[]}[]}
 */
export function analyzeStructure(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n');
  const hasTags = /\[[^\]]+\]/.test(text);

  if (hasTags) {
    const sections = [];
    let current = null;
    for (const raw of lines) {
      const line = raw.trim();
      const m = line.match(/^\[([^\]]+)\]$/);
      if (m) {
        current = { type: classify(m[1]), label: m[1], lines: [] };
        sections.push(current);
      } else if (line && current) {
        current.lines.push(line);
      } else if (line && !current) {
        current = { type: 'verse', label: 'Verse', lines: [line] };
        sections.push(current);
      }
    }
    return sections;
  }

  // No tags: split on blank lines, guess chorus by repetition.
  const stanzas = text.split(/\n\s*\n/).map((s) => s.split('\n').filter(Boolean)).filter((s) => s.length);
  const seen = new Map();
  return stanzas.map((linesArr, i) => {
    const key = linesArr.join('|');
    const isRepeat = seen.has(key);
    seen.set(key, true);
    return {
      type: isRepeat ? 'chorus' : 'verse',
      label: isRepeat ? 'Chorus' : `Verse ${i + 1}`,
      lines: linesArr,
    };
  });
}

function classify(label) {
  const l = label.toLowerCase();
  if (l.includes('chorus') || l.includes('refr')) return 'chorus';
  if (l.includes('bridge') || l.includes('ponte')) return 'bridge';
  if (l.includes('hook')) return 'hook';
  if (l.includes('intro')) return 'intro';
  if (l.includes('outro')) return 'outro';
  return 'verse';
}

/**
 * Improve existing lyrics via the LLM. Returns improved text or the original on
 * any failure (graceful).
 * @param {string} lyrics @param {object} manager @param {{language?:string}=} o
 */
export async function improveLyrics(lyrics, manager, o = {}) {
  if (!manager || !lyrics) return lyrics;
  const system =
    'You are a professional lyricist. Improve these lyrics: sharpen imagery, keep ' +
    'the meaning, keep the [Section] tags and the language the same. Return only lyrics.';
  const res = await manager.llm({ system, user: lyrics, temperature: 0.7, maxTokens: 400 });
  return (res.ok && res.data?.text?.trim()) ? res.data.text.trim() : lyrics;
}

/**
 * Translate lyrics to a target language. Offline/no-manager → returns original
 * unchanged (so nothing breaks); online → real translation preserving structure.
 * @param {string} lyrics @param {string} toLanguage @param {object} manager
 */
export async function translateLyrics(lyrics, toLanguage, manager) {
  if (!manager || !lyrics) return { text: lyrics, translated: false };
  const system =
    `Translate these song lyrics into ${toLanguage}. Preserve the [Section] tags, ` +
    `line breaks, and singable rhythm. Return only the translated lyrics.`;
  const res = await manager.llm({ system, user: lyrics, temperature: 0.5, maxTokens: 500 });
  if (res.ok && res.data?.text?.trim()) return { text: res.data.text.trim(), translated: true };
  return { text: lyrics, translated: false };
}

/**
 * Suggest rhyme improvements. Returns an array of suggestion strings (or []).
 * @param {string} lyrics @param {object} manager
 */
export async function suggestRhymes(lyrics, manager) {
  if (!manager || !lyrics) return [];
  const system =
    'You are a rhyme coach. Suggest up to 5 concrete rhyme or wording improvements ' +
    'for these lyrics. Return STRICT JSON: {"suggestions": ["...", "..."]}.';
  const res = await manager.llm({ system, user: lyrics, json: true, temperature: 0.6, maxTokens: 300 });
  if (res.ok && res.data?.parsed?.suggestions) return res.data.parsed.suggestions;
  return [];
}

/**
 * Produce an alternate version of the lyrics (a different take on the same theme).
 * @param {string} lyrics @param {object} manager
 */
export async function alternateVersion(lyrics, manager) {
  if (!manager || !lyrics) return lyrics;
  const system =
    'Rewrite these lyrics as a fresh alternate version: same theme, language and ' +
    'mood, different words and images. Keep [Section] tags. Return only lyrics.';
  const res = await manager.llm({ system, user: lyrics, temperature: 1.0, maxTokens: 400 });
  return (res.ok && res.data?.text?.trim()) ? res.data.text.trim() : lyrics;
}
