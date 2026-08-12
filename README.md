# Musyx — Setup & Deploy Guide

This folder is a complete, installable web app (PWA). Once deployed it gives you:

- A **permanent URL** that never expires
- **Installable** on iPhone, Android, and computer (opens like a native app, no browser bar)
- **Offline storage** on the device — songs, drafts, and queue saved locally (IndexedDB)
- **Real music generation** once you add an API key (works in demo mode until then)

You do three things: (1) put the app online, (2) optionally turn on real music, (3) install it.
Total time: about 10 minutes. No credit card required for the free URL.

---

## Files in this folder

| File | What it is |
|------|------------|
| `index.html` | The whole app |
| `manifest.webmanifest` | Makes it installable |
| `sw.js` | Service worker — offline + install |
| `icons/` | App icons |
| `worker.js` | The tiny server that holds your music API key |
| `README.md` | This guide |

Keep the folder structure exactly as-is (the `icons/` folder must stay next to `index.html`).

---

## STEP 1 — Put the app online (permanent free URL via GitHub Pages)

GitHub Pages is the most permanent free option: the URL never expires and there's no billing.

1. Create a free account at **https://github.com**
2. Click **New repository**. Name it `musyx`. Set it to **Public**. Click **Create**.
3. On the new repo page click **uploading an existing file**.
4. Drag in **all the files and the `icons` folder** from this folder. Click **Commit changes**.
5. Go to the repo's **Settings → Pages**.
6. Under "Build and deployment", set **Source = Deploy from a branch**, **Branch = main**, **Folder = / (root)**. Click **Save**.
7. Wait ~1 minute. Your permanent link appears at the top:
   `https://YOUR-USERNAME.github.io/musyx/`

That link is now live forever. To update the app later, just upload a new `index.html` to the repo.

> **Tip:** Netlify (https://app.netlify.com/drop) is even faster — drag the folder in and you get a link in 30 seconds — but GitHub Pages is the one that never gets cleaned up, which is what you asked for.

---

## STEP 2 — Turn on REAL music generation (optional, ~$0.05/song)

Until you do this, the app runs in **demo mode**: the full flow works and plays a built-in
sample tone. To generate real songs you need a key + the tiny proxy server (so the key
stays secret). We use **WaveSpeedAI**, which hosts an open model cheaply.

### 2a. Get a music API key
1. Sign up at **https://wavespeed.ai**
2. Add a few dollars of credit (each song is about $0.05).
3. Copy your **API key**.

### 2b. Deploy the proxy (Cloudflare Workers — free, no card)
1. Sign up at **https://dash.cloudflare.com**
2. **Workers & Pages → Create → Worker**. Name it `musyx-api`. Click **Deploy**.
3. Click **Edit code**. Delete what's there, paste the entire contents of `worker.js`. Click **Deploy**.
4. Go to the worker's **Settings → Variables and Secrets → Add**:
   - Type: **Secret**
   - Name: `MUSIC_API_KEY`
   - Value: *(your WaveSpeedAI key)*
   - Save.
5. Copy your worker URL — it looks like `https://musyx-api.YOURNAME.workers.dev`

### 2c. Point the app at your proxy
1. Open `index.html`, find this block near the top of the script (search for `CONFIG`):
   ```js
   const CONFIG={
     API_ENDPOINT: "",   // <-- paste your worker URL + "/generate"
   ```
2. Set it to your worker URL plus `/generate`:
   ```js
   API_ENDPOINT: "https://musyx-api.YOURNAME.workers.dev/generate",
   ```
3. Re-upload `index.html` to GitHub (Step 1, point 7).

Done. The app now sends prompts to your proxy, which calls the model and returns a real
song. The result is cached on the device so it plays offline afterward.

> **Demo mode is automatic fallback.** If the key is missing, the connection drops, or the
> provider errors, the app quietly uses the sample tone so a live demo never breaks.

---

## STEP 3 — Install it on a phone or computer

**iPhone (Safari):** open the link → Share button → **Add to Home Screen**.
**Android (Chrome):** open the link → menu (⋮) → **Install app** / **Add to Home Screen**.
**Computer (Chrome/Edge):** open the link → install icon in the address bar → **Install**.

It now launches full-screen like a native app and works offline.

---

## What works offline vs. online

| Works offline | Needs internet |
|---------------|----------------|
| Open app, dashboard, library | Generating a new song |
| Questionnaire wizard + drafts | Processing a payment |
| Local prompt generation | Syncing to the cloud |
| Playing already-downloaded songs | |
| Viewing history | |

Create a song while offline and it's saved to a local queue marked "Queued". When the
connection returns, the app flushes the queue automatically.

---

## Demo tips for showing founders

- The green **Online/Offline pill** in the top bar lets you simulate losing connection on
  the spot — flip it offline, create a song, show it queue, flip it back, watch it sync.
- The **PT / EN toggle** switches the entire app instantly.
- The **prompt preview** screen shows the real generated prompt — your transparency differentiator.

---

## Important honesty notes

- **Costs:** real generation isn't free. WaveSpeedAI is ~$0.05/song; Cloudflare and GitHub
  Pages are free at this scale. Truly free models exist but require a GPU and are
  non-commercial-licensed, so they don't fit this product.
- **Payments are simulated.** Wiring real Stripe / M-Pesa / e-Mola needs accounts and a
  backend; the flow and UI are built and ready for it.
- **This is a front-end + proxy prototype**, not the full production system (no user
  accounts, database, or admin yet — those are in the architecture blueprint document).
