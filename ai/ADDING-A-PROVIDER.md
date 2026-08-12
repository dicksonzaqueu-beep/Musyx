# Adding a Music Provider to Musyx

Musyx's AI layer is built so a new music engine (Suno, Udio, Stable Audio, or
anything future) is a **self-contained file** implementing one interface. Nothing
in the app, UI, or other providers changes. This guide shows the whole process.

## The contract

Every music provider is an object with an `info` descriptor and two methods:

```js
{
  info: {
    id: 'music-yourprovider',     // unique
    capability: 'music',
    label: 'Your Provider',
    online: true,
    features: ['lyrics','vocals','poll','commercial'],  // see "Features" below
    endpoint: '<your proxy /generate route>',
  },
  async start(req) { /* returns AIResult<MusicJob> */ },
  async poll(id)   { /* returns AIResult<MusicJob> */ },
}
```

`start()` begins generation and returns either a completed job (with `audioUrl`)
or a `processing` job (with an `id` to poll). `poll(id)` checks a job until it's
`completed` or `failed`. Use the `ok()` / `fail()` helpers from `interfaces.js`
so every result has the same shape.

## Step 1 — copy an existing provider

The fastest start is to copy `ai/providers/music-udio.js` (a pollable provider)
and rename it. It already has the right structure, error mapping (401/403 → auth,
429 → rate_limit, network throw → offline), and CORS-free proxy calls.

```
cp ai/providers/music-udio.js ai/providers/music-yourprovider.js
```

Then change: the `info.id`, `info.label`, `info.features`, and the request/response
mapping inside `start()` and `poll()` to match your provider's API shape.

## Step 2 — set the right `features`

The `features` array is not decorative — the **capability-aware selector**
(`ai/music-selector.js`) reads it to route jobs. Use these flags:

| Flag | Meaning |
|------|---------|
| `lyrics` | Can sing provided/generated lyrics |
| `vocals` | Produces vocals at all |
| `instrumental` | Produces instrumental audio |
| `sfx` | Sound-design / effects |
| `extend` | Can extend an existing track |
| `remix` | Can remix |
| `poll` | Uses a job-id + poll flow (vs. immediate URL) |
| `commercial` | Output carries a commercial licence |
| `fast` | Notably low latency (tie-breaker) |

**Important:** if your provider is instrumental-only, OMIT `lyrics` and `vocals`.
The selector will then correctly avoid routing a needs-vocals song to it (this is
exactly how `music-stableaudio.js` is set up).

## Step 3 — register it

Add two lines to `ai/bootstrap.js`:

```js
import { createYourProvider } from './providers/music-yourprovider.js';
// inside initAI(), in the music block:
registry.register(createYourProvider({ endpoint: CONFIG.YOURPROVIDER_ENDPOINT || '' }));
```

To make it the **primary** provider instead of a fallback, either register it
first, or call once at startup:

```js
registry.setActive('music', 'music-yourprovider');
```

## Step 4 — add the proxy route (keeps your key secret)

Your provider key must never ship in the page. Add a route to `worker.js`
mirroring the WaveSpeed `/generate` route (or give your provider its own route),
holding the key as a Cloudflare **Secret**. Point `CONFIG.YOURPROVIDER_ENDPOINT`
at that route.

## Step 5 — cache it for offline (optional but recommended)

Add the new file to the `ASSETS` list in `sw.js` and bump the `CACHE` version, so
the module is available offline like the rest of the app.

## That's it

No consumer code changes. The app calls `registry.get('music')` /
`selectMusicProviders()`, the manager handles retry + fallback + queueing, and
your provider slots into all of it automatically. The whole point of the
abstraction is that adding an engine is additive, never invasive.

## How selection works (so you can predict routing)

On each generation, the app calls `selectMusicProviders(answers)`:
1. It derives the job's needs (needs vocals? needs lyrics?).
2. It scores every registered provider on capability fit; a hard mismatch
   (needs vocals, provider instrumental-only) is excluded.
3. It returns an ordered list, best first, which the manager tries in order
   (retrying transient failures, falling back on hard failures).
4. If nothing matches cleanly, it falls back to the active provider so a user
   always gets *something* — availability beats perfection for this market.

Phase 8 will extend the score with cost and provider-health signals; your
provider participates automatically once those weights are added.
