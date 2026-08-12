# Musyx AI Layer — Future Roadmap (Phase 9)

How today's architecture supports tomorrow's features. The point of this phase
isn't to build everything — it's to show that each future capability is an
*additive* change (a new provider file + one registration line), never a rewrite.
We proved it: the `ImageProvider` seam, defined empty back in Phase 2, is now
activated by a single cover-artwork stub. Every item below plugs into an existing
seam the same way.

## The one idea that makes all of this cheap

Musyx doesn't contain AI models — it *coordinates* them behind interfaces. Adding
a capability means writing a small adapter that implements an interface and
registering it. The app, UI, offline queue, cost tracking, and caching all work
on the new capability automatically because they depend on the interface, not on
any specific provider. This is why the roadmap below is realistic rather than
aspirational.

## Feature-by-feature: which seam it uses

| Future feature | Seam it plugs into | What's needed to ship it |
|----------------|--------------------|--------------------------|
| **Local LLMs** (on-device) | `LLMProvider` | A provider that runs a small model via WebGPU/WASM instead of calling a proxy. Sets `info.online = false`, so it works offline. Manager/cache/routing unchanged. |
| **Cover artwork** | `ImageProvider` ✅ (stub shipped) | Point the stub at a real image model behind a worker `/image` route. |
| **Voice cloning** | New `VoiceProvider` interface (same pattern) | Add the interface + a provider; register it. UI adds a "use my voice" option. |
| **AI singers** | `MusicProvider` (`features:['vocals']`) | A provider whose model sings; the capability selector already routes vocal jobs correctly. |
| **Video generation** | New `VideoProvider` interface | Same additive pattern; likely a pollable long-job like music. |
| **Sound effects** | `MusicProvider` (`features:['sfx']`) | Stable Audio stub already declares `sfx`; wire a real endpoint. |
| **Podcast generation** | `LLMProvider` (script) + `MusicProvider` (beds) + a future TTS provider | Composed from existing capabilities plus one new TTS provider. |
| **Advertising jingles** | Existing prompt engine + `MusicProvider` | Mostly a prompt-engine preset (`useCase: 'Advertisement'`) — minimal new code. |
| **Music education** | `LLMProvider` (explanations) + genre-db (facts) | Reuses the knowledge base and LLM; new UI, little new AI. |
| **Plugin marketplace** | The registry itself | Third parties ship provider modules that register into the same registry. The interface contract *is* the plugin API. |
| **White-label API** | The whole AI layer | Expose the manager behind your own HTTP API; the layer is already framework-free and wrapper-safe. |

## Roadmap phasing (suggested)

**Near term (unlocks with the LLM route you already have):** cover artwork,
advertising-jingle presets, music-education explanations. These reuse the LLM and
image seams already in place.

**Mid term:** AI singers and sound effects (new music providers), voice cloning
(new interface), podcast generation (composition of existing + TTS).

**Long term:** local on-device LLMs (offline intelligence — the ultimate fit for
the Africa-first thesis), video generation, plugin marketplace, white-label API.

## Why local AI is the strategic endgame

Every other feature adds capability; local on-device models change the *economics
and the offline story*. A small on-device model for prompt enhancement, genre
recommendation, or lyric drafting means those features cost nothing per call and
work with zero connectivity — the strongest possible version of the offline-first
promise. The architecture already anticipates this: an `LLMProvider` with
`info.online = false` slots in with no manager, cache, or routing changes. Nothing
needs to be re-architected; it's a new provider file.

## What's genuinely still open (technical debt, honest list)

- **Real provider integrations:** Suno/Udio/Stable Audio/image are stubs; each
  needs its real API + a worker route + a key.
- **Server-side rate limiting & auth:** the client guard is UX-only; real limits
  and user accounts live in the backend, which doesn't exist yet.
- **Payments are simulated:** the flow is built; real Stripe/M-Pesa/e-Mola needs
  accounts and backend.
- **Semantic cache & batching:** intentionally deferred until the cost monitor
  shows they're needed.
- **No test runner in the repo:** logic is tested via scripts during development;
  a permanent test setup would help as the team grows.
