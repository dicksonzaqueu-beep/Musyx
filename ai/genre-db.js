/**
 * Musyx AI Layer — Genre Knowledge Base (Phase 4)
 * ================================================
 * Static, offline musical knowledge that lets the rule-based prompt engine
 * produce PROFESSIONAL prompts with no network and no LLM. This is what keeps
 * the "AI" useful even at zero cost and zero connectivity — the engine reasons
 * over this table instead of guessing.
 *
 * WHY A TABLE INSTEAD OF ASKING AN LLM EVERY TIME:
 *   - Free & instant & offline (the core Musyx constraint).
 *   - Deterministic: the same answers give the same professional baseline, which
 *     is easier to test and to trust in a demo.
 *   - The LLM (when enabled) ENHANCES this, it doesn't replace it — so even the
 *     enhanced path starts from correct musical facts, reducing hallucination.
 *
 * Values are typical, defensible ranges gathered as general music-production
 * knowledge. They are starting points a producer would recognize, not dogma.
 * Everything is keyed by the exact English genre labels used in index.html
 * (GENRES[]), so the engine can look up by the user's selection directly.
 */

export const GENRE_DB = {
  'Afro House': {
    bpm: [118, 125], key: 'A minor',
    instruments: ['deep house bass', 'log drums', 'shakers', 'congas', 'atmospheric pads', 'vocal chops'],
    production: 'four-on-the-floor kick, rolling percussion, wide reverb tails, hypnotic groove',
    reference: 'Black Coffee, Da Capo',
  },
  'Amapiano': {
    bpm: [110, 115], key: 'F minor',
    instruments: ['log drums', 'jazzy piano', 'shakers', 'sub bass', 'airy pads', 'vocal ad-libs'],
    production: 'signature log-drum bassline, swung percussion, spacious mix, soulful piano chords',
    reference: 'Kabza De Small, DJ Maphorisa',
  },
  'Hip-Hop': {
    bpm: [85, 95], key: 'C minor',
    instruments: ['808 bass', 'boom-bap drums', 'sampled keys', 'vinyl texture', 'brass stabs'],
    production: 'hard-hitting drums, punchy 808s, head-nod groove, sample-based melody',
    reference: 'classic boom-bap to modern trap-soul',
  },
  'Rap': {
    bpm: [85, 100], key: 'G minor',
    instruments: ['808 bass', 'crisp hats', 'dark piano', 'string stabs'],
    production: 'aggressive drums, rhythmic hi-hat rolls, space for vocal delivery',
    reference: 'modern lyrical rap',
  },
  'Trap': {
    bpm: [130, 150], key: 'D minor', halfTimeFeel: true,
    instruments: ['booming 808s', 'rapid hi-hat rolls', 'snappy snares', 'dark synth leads', 'bells'],
    production: 'half-time feel, sliding 808s, triplet hats, sparse dark melody',
    reference: 'Metro Boomin-style production',
  },
  'EDM': {
    bpm: [126, 132], key: 'F major',
    instruments: ['supersaw leads', 'sidechained bass', 'white-noise risers', 'punchy kick', 'plucks'],
    production: 'big build-ups and drops, sidechain pumping, festival-scale energy',
    reference: 'mainstage EDM',
  },
  'Pop': {
    bpm: [100, 120], key: 'C major',
    instruments: ['bright synths', 'electric bass', 'clean drums', 'piano', 'layered vocals'],
    production: 'catchy topline, polished radio-ready mix, strong hook in the chorus',
    reference: 'contemporary chart pop',
  },
  'Rock': {
    bpm: [110, 140], key: 'E minor',
    instruments: ['distorted electric guitars', 'live drums', 'bass guitar', 'organ'],
    production: 'driving guitars, live-feel drums, dynamic loud choruses',
    reference: 'modern alternative rock',
  },
  'Jazz': {
    bpm: [90, 130], key: 'Bb major',
    instruments: ['upright bass', 'brushed drums', 'piano', 'saxophone', 'muted trumpet'],
    production: 'swing feel, warm acoustic recording, improvisational phrasing',
    reference: 'small-combo jazz',
  },
  'Lo-Fi': {
    bpm: [70, 85], key: 'D minor',
    instruments: ['dusty piano', 'mellow rhodes', 'soft drums', 'vinyl crackle', 'warm bass'],
    production: 'relaxed swing, tape saturation, vinyl noise, cozy low-fidelity warmth',
    reference: 'lo-fi hip-hop study beats',
  },
  'Piano': {
    bpm: [60, 90], key: 'C major',
    instruments: ['grand piano', 'subtle strings', 'ambient pad'],
    production: 'intimate solo piano, natural dynamics, emotional space and rubato',
    reference: 'contemporary neoclassical piano',
  },
  'Cinematic': {
    bpm: [70, 100], key: 'D minor',
    instruments: ['full string section', 'brass', 'timpani', 'choir', 'piano', 'sub hits'],
    production: 'epic orchestral build, wide dynamics, emotional swells, trailer-style impacts',
    reference: 'film-score / trailer music',
  },
  'Gospel': {
    bpm: [70, 100], key: 'Ab major',
    instruments: ['hammond organ', 'grand piano', 'choir', 'bass guitar', 'live drums'],
    production: 'rich vocal harmonies, call-and-response, uplifting key changes, live energy',
    reference: 'contemporary gospel',
  },
  'Afrobeat': {
    bpm: [98, 112], key: 'E minor',
    instruments: ['afro percussion', 'guitar riffs', 'horn section', 'bass', 'talking drum'],
    production: 'syncopated groove, layered percussion, bright horns, danceable pocket',
    reference: 'Afrobeats (Burna Boy, Wizkid lineage)',
  },
  'R&B': {
    bpm: [60, 90], key: 'Eb minor',
    instruments: ['smooth keys', 'sub bass', 'finger snaps', 'lush pads', 'guitar licks'],
    production: 'silky vocals, laid-back groove, warm harmonies, tasteful ad-libs',
    reference: 'modern R&B / neo-soul',
  },
  'Kizomba': {
    bpm: [88, 102], key: 'A minor',
    instruments: ['soft synth pads', 'zouk-style guitar', 'gentle percussion', 'warm bass'],
    production: 'sensual slow groove, romantic melody, smooth Angolan zouk feel',
    reference: 'Angolan kizomba',
  },
};

/** Mood → sonic direction, used to bias production notes. English mood labels. */
export const MOOD_DB = {
  Happy: 'bright major tonality, uplifting energy',
  Sad: 'minor key, melancholic melody, sparse arrangement',
  Romantic: 'warm harmonies, tender melody, intimate feel',
  Epic: 'huge dynamics, layered build, powerful climax',
  Emotional: 'expressive phrasing, dynamic swells',
  Motivational: 'driving rhythm, rising energy, anthemic hook',
  Dark: 'minor key, tense atmosphere, heavy low end',
  Relaxing: 'gentle tempo, soft textures, calm space',
  Energetic: 'fast groove, punchy drums, high drive',
  Aggressive: 'hard-hitting drums, distorted energy, intense',
  Inspirational: 'soaring melody, bright uplifting chords',
  Spiritual: 'reverent tone, choir textures, transcendent space',
};

/** Map the UI tempo choice to a concrete BPM within the genre range. */
export function resolveBpm(genreName, tempoIndex /*0 slow,1 med,2 fast*/) {
  const g = GENRE_DB[genreName];
  if (!g) return [90, 110][tempoIndex] || 100;
  const [lo, hi] = g.bpm;
  if (tempoIndex === 0) return lo;
  if (tempoIndex === 2) return hi;
  return Math.round((lo + hi) / 2);
}
