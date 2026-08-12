/**
 * Musyx AI Layer — Capability-Aware Music Selection (Phase 6)
 * ===========================================================
 * This is the "intelligent coordination" your product thesis calls for: instead
 * of blindly using whichever music provider is active, Musyx can pick the best
 * REGISTERED provider for the specific job — and, crucially, AVOID providers that
 * can't do what the job needs (e.g. don't route a song-with-vocals to an
 * instrumental-only engine).
 *
 * This is orchestration logic, not UI. It sits between the app and the LLM
 * Manager's fallback chain: it produces the ORDERED list of providers the manager
 * should try, filtered and ranked by capability match. If no provider is a clean
 * match it degrades gracefully (returns the active provider anyway) rather than
 * blocking generation — availability beats perfection for this market.
 *
 * WRAPPER-SAFE: pure functions over the registry's plain descriptors. No network.
 *
 * HOW IT FEEDS PHASE 8:
 *   The scoring function is where cost/latency weighting will plug in later. For
 *   now it ranks purely on capability fit; Phase 8 adds cost and health signals
 *   as additional score terms without changing this function's shape.
 */

/**
 * Derive a job's capability requirements from the questionnaire answers.
 * @param {import('./prompt-engine.js').PromptAnswers} answers
 * @returns {{needsVocals: boolean, needsLyrics: boolean, instrumentalOk: boolean}}
 */
export function requirementsFromAnswers(answers) {
  const instrumental = /instrumental/i.test(answers.vocals || '') ||
                       /instrumental/i.test(answers.lyricsMode || '');
  return {
    needsVocals: !instrumental,
    needsLyrics: !instrumental && !/provide/i.test(answers.lyricsMode || ''),
    instrumentalOk: true, // every job can accept instrumental as a floor
  };
}

/**
 * Score how well a provider matches the job. Higher = better. A hard mismatch
 * (job needs vocals, provider can't sing) returns -1 to exclude it.
 *
 * @param {{info: {features: string[]}}} provider
 * @param {ReturnType<typeof requirementsFromAnswers>} req
 * @returns {number}
 */
export function scoreProvider(provider, req) {
  const f = provider.info.features || [];
  const has = (x) => f.includes(x);

  // Hard exclusion: needs vocals but provider is instrumental-only.
  if (req.needsVocals && !has('vocals') && !has('lyrics') && has('instrumental')) {
    return -1;
  }

  let score = 0;
  if (req.needsLyrics && has('lyrics')) score += 3;
  if (req.needsVocals && has('vocals')) score += 2;
  if (has('commercial')) score += 1;   // commercial licence is valuable for Musyx
  if (has('fast')) score += 0.5;        // minor tie-breaker
  // Phase 8 will add: - costWeight * estCost, + healthWeight * recentSuccessRate
  return score;
}

/**
 * Produce the ORDERED provider list the manager should try for this job.
 * Filters out hard mismatches, ranks the rest, and always keeps the active
 * provider as a last-resort fallback so generation is never fully blocked.
 *
 * @param {object} registry   the AI registry
 * @param {import('./prompt-engine.js').PromptAnswers} answers
 * @returns {{ordered: any[], chosen: any|null, reason: string}}
 */
export function selectMusicProviders(registry, answers) {
  const all = registry.chain('music'); // active first, then the rest
  if (!all.length) return { ordered: [], chosen: null, reason: 'no music providers registered' };

  const req = requirementsFromAnswers(answers);

  const scored = all
    .map((p) => ({ p, s: scoreProvider(p, req) }))
    .filter((x) => x.s >= 0)               // drop hard mismatches
    .sort((a, b) => b.s - a.s);            // best first

  if (!scored.length) {
    // Everything was a hard mismatch (rare). Fall back to the active provider so
    // the user still gets SOMETHING rather than an error.
    const active = registry.get('music');
    return {
      ordered: active ? [active] : [],
      chosen: active,
      reason: 'no capability match — using active provider as fallback',
    };
  }

  const ordered = scored.map((x) => x.p);
  return {
    ordered,
    chosen: ordered[0],
    reason: `matched on capability (score ${scored[0].s})`,
  };
}
