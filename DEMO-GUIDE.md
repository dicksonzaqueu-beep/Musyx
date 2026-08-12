# Musyx — Where the AI Fits + How to Demo It (Simple Guide)

This is written to be shared with your colleagues so anyone can install the app,
try it, and send feedback. No technical knowledge needed.

---

## Part 1 — Where the AI part fits in the whole project

Musyx V2 has a few big pieces. Think of the app like a car:

- **The body and dashboard** (the screens, buttons, the offline app that installs
  on a phone) — this is the app shell.
- **The engine that makes the music** — external music services (WaveSpeed today;
  Suno/Udio later).
- **The payment system** — Stripe, PayPal, M-Pesa, e-Mola (built as a demo for now).
- **The brain that decides what to ask the music engine, writes the prompt, writes
  the lyrics, picks the best service, retries when the network drops, and keeps
  costs down** — **this is the AI Intelligence Layer. This is the part built here.**

In one sentence: **the AI layer is the brain of Musyx.** It sits between the
questionnaire the user fills in and the music engine that makes the song. It turns
simple answers into a professional prompt, writes lyrics, chooses which AI service
to use, handles bad connections gracefully, and tracks spending — all while
working offline wherever possible.

It's built as separate, swappable modules (in the `ai/` folder) so any piece — a
music provider, the language model, the lyric writer — can be replaced without
touching the rest of the app. That's the whole design idea: **Musyx coordinates
AI services intelligently; it is never "just another AI."**

### How this maps to the team

- **Prince (build/create):** the app shell, the music/payment integrations, the
  ERP/offline work.
- **You / Dickson (the AI):** the intelligence layer described above — the brain.
- **Adelson:** supporting build/grow/impact.

The AI layer is designed to hand off cleanly: it exposes simple hooks the rest of
the app calls, and it never depends on the app's internals. So your part can
progress independently of Prince's, and they meet at documented seams.

### What's real vs. simulated right now (be honest with testers)

- **Real and working:** the full app flow, offline use, installing on a phone,
  local storage of songs, the prompt engine, lyric structure, provider
  coordination, retry/queue, cost tracking.
- **Simulated for the demo:** actual music generation plays a built-in sample
  tone unless a real API key is connected; payments are simulated. Tell testers
  this so they know the "song" they hear in the demo is a placeholder sound.

---

## Part 2 — How to demo Musyx on your phone (Lego-simple)

There are two ways. **Way A** is for when the app is already online at a web
address (easiest — just a link). **Way B** is for testing the files directly.
For your colleagues, **Way A is what you want.**

### First: get the app online (you do this once)

1. Go to **github.com** and make a free account (if you don't have one).
2. Click the **+** at the top right → **New repository**.
3. Name it `musyx`. Choose **Public**. Click **Create repository**.
4. Click **uploading an existing file**.
5. Open the `musyx` folder from the zip on your computer. Select **everything
   inside it** (the `index.html`, the `ai` folder, the `icons` folder, all of it)
   and drag it into the browser. Wait for it to finish. Click **Commit changes**.
6. Click **Settings** (top menu) → **Pages** (left menu).
7. Under **Branch**, pick **main**, folder **/ (root)**, click **Save**.
8. Wait about 1 minute. Refresh. A link appears at the top like:
   **`https://YOURNAME.github.io/musyx/`**
9. That link is permanent. Copy it. This is what you send to colleagues.

> If you'd rather not use GitHub: go to **app.netlify.com/drop** and drag the
> `musyx` folder onto the page. You get a link in about 30 seconds. (GitHub Pages
> lasts forever with no account limits, which is why it's the main recommendation.)

### On an iPhone (send your colleague these steps)

1. Open the link in **Safari** (must be Safari, not Chrome, on iPhone).
2. Tap the **Share** button (the square with an arrow pointing up, at the bottom).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** (top right).
5. Close Safari. Find the **Musyx** icon on the home screen and tap it.
6. It opens full-screen like a real app. Done.

### On an Android (send your colleague these steps)

1. Open the link in **Chrome**.
2. Tap the **three dots** (⋮) at the top right.
3. Tap **Install app** (or **Add to Home screen**).
4. Tap **Install**.
5. Find the **Musyx** icon in the app drawer and tap it.
6. It opens full-screen like a real app. Done.

### On a computer (Chrome or Edge)

1. Open the link.
2. Look for a small **install icon** in the address bar (a screen with a down
   arrow). Click it → **Install**. Or use the menu → **Install Musyx**.

---

## Part 3 — What to tell testers to try (so feedback is useful)

Give your colleagues this short checklist:

1. **Switch language** — tap **PT / EN** at the top. Does everything translate?
2. **Make a song** — tap "Começar / Start," answer the 7 questions, watch the
   prompt appear, tap through to generation and results.
3. **Look at the prompt** — on the prompt screen, notice it shows the actual
   prompt (BPM, instruments). Is it clear and useful?
4. **Play the demo tone** — tap the play button. (Reminder: it's a placeholder
   sound, not a real song yet.)
5. **Test offline** — turn on Airplane Mode, then open the app again. Does it
   still open and let you create? Then use the green **Online/Offline** button in
   the app to simulate a dropped connection during generation — the song should
   queue and show as "queued."
6. **Check the dashboard** — are the songs they made saved there? Close the app
   and reopen — are they still there?

### How they send feedback

Ask for: what phone they used, what worked, what felt confusing, and anything
that broke. A screenshot helps. Keep it simple — even one sentence per point is
useful.

---

## Part 4 — Which mode for each production phase (paid vs. demo)

Your question about "which mode to put the paid version in" for each phase — here's
the simple guide. "Mode" here means: demo tone vs. real music, and simulated vs.
real payment.

| Phase | Music mode | Payment mode | Why |
|-------|-----------|--------------|-----|
| **Now — internal demo** (this month) | Demo tone | Simulated | Free to run; colleagues test the experience, not the billing. |
| **Investor / founder demo** | Real music (add WaveSpeed key, ~$0.05/song) | Simulated | Real songs impress; you control a small spend; no payment risk. |
| **Closed beta** (few real users) | Real music | Real payment, low limits | Test the money flow with real but capped usage. |
| **Public launch** | Real music + fallback providers | All payment rails on | Full product; cost controls and monitoring (Phase 8) active. |

**How to switch modes:** it's one line in `index.html`. Find the `CONFIG` block
near the top of the script:

- Demo tone → leave `API_ENDPOINT: ""` empty.
- Real music → set `API_ENDPOINT` to your worker's `/generate` URL (see the main
  setup guide for the worker).
- Real AI prompts/lyrics → set `LLM_ENDPOINT` to your worker's `/llm` URL.
- Real cover art (future) → set `IMAGE_ENDPOINT`.

Nothing else changes — the app automatically uses real services when the keys are
present and falls back to demo/local when they're not. That's the whole point of
the design: **the same app is your demo AND your production app; you just flip on
the parts you're ready to pay for.**
