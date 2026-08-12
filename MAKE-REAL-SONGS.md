# Make Musyx Generate REAL Songs — Click-by-Click

Follow this once. At the end, you and your colleagues make real songs on your
phones. Good news: **WaveSpeed gives $20 in free credits at signup**, and each
song costs about **$0.05** — so your first few hundred songs are effectively free.

You'll set up 3 free things and change 1 line. Total time: about 30 minutes.

```
  [1] Put the app online   →   [2] Get a music key   →   [3] Connect them
        (GitHub Pages)            (WaveSpeed)               (Cloudflare + 1 line)
```

Do them in order. Don't skip. Each step ends with something you can check.

---

## STEP 1 — Put the app online (free, permanent)

1. Go to **github.com** → **Sign up** (free). Verify your email.
2. Click the **+** (top right) → **New repository**.
3. Repository name: type `musyx`. Select **Public**. Click **Create repository**.
4. On the next page, click the link **uploading an existing file**.
5. On your computer, open the `musyx` folder from the zip. Select **everything
   inside** it (index.html, the `ai` folder, the `icons` folder, sw.js,
   manifest, worker.js — all of it). Drag it all into the browser window.
6. Wait for the upload bar to finish. Click the green **Commit changes**.
7. Click **Settings** (top menu of the repo).
8. Click **Pages** (left menu).
9. Under **Branch**: choose **main**, keep folder **/ (root)**, click **Save**.
10. Wait ~1 minute. Refresh the page. A green box shows your link:
    **`https://YOURNAME.github.io/musyx/`**

✅ **Check:** open that link on your computer. The Musyx app loads. (It still
plays the demo tone — that's expected until Step 3.)

---

## STEP 2 — Get your music key (free $20 credit)

1. Go to **wavespeed.ai** → **Sign up** (free).
2. After signing in, look for **API Keys** (usually under your account/profile
   menu, or a "Dashboard" / "API" section).
3. Click **Create API key** (or "New key"). Give it a name like `musyx`.
4. **Copy the key** and paste it somewhere safe for a moment (a note on your
   computer). It looks like a long string of letters and numbers.

> Note: you get $20 free credit. Some accounts ask for a small top-up to
> "activate" API access even with free credit — if it asks, the minimum is small
> and the $20 credit still covers your actual songs. Check your balance shows the
> free credit before moving on.

✅ **Check:** you have an API key copied, and your account shows credit.

---

## STEP 3 — Connect them (the secret keeper + 1 line)

Your key must never go in the app directly (anyone could steal it). It goes in a
tiny free "middleman" that keeps it secret. This is Cloudflare Workers.

### 3a — Make the middleman

1. Go to **dash.cloudflare.com** → **Sign up** (free). Verify email.
2. On the left menu, click **Workers & Pages**.
3. Click **Create** → **Create Worker**.
4. Name it `musyx-api`. Click **Deploy** (it deploys a hello-world for now).
5. Click **Edit code** (or "Continue to project" → "Edit code").
6. Delete all the code shown in the editor.
7. Open the file **worker.js** (from your musyx folder) in a text editor,
   select all, copy it, and paste it into the Cloudflare editor.
8. Click **Deploy** (top right).

### 3b — Put your key in the middleman (as a secret)

1. Still in the worker, click **Settings** → **Variables and Secrets**
   (or "Variables").
2. Click **Add** → choose type **Secret**.
3. Name: type exactly `MUSIC_API_KEY`
4. Value: paste your WaveSpeed key from Step 2.
5. Click **Save** / **Deploy**.

### 3c — Get the middleman's address

1. At the top of the worker page, find its URL. It looks like:
   **`https://musyx-api.YOURNAME.workers.dev`**
2. Copy it.

### 3d — Tell the app to use it (the 1 line)

1. Go back to your GitHub `musyx` repository.
2. Click on **index.html**.
3. Click the **pencil icon** (top right of the file) to edit.
4. Press Ctrl+F (or Cmd+F on Mac) and search for: `API_ENDPOINT`
5. You'll see this line:
   ```
   API_ENDPOINT: "",
   ```
6. Put your worker URL inside the quotes, and add `/generate` at the end:
   ```
   API_ENDPOINT: "https://musyx-api.YOURNAME.workers.dev/generate",
   ```
   (Use YOUR actual worker address from Step 3c.)
7. Scroll down, click **Commit changes**.
8. Wait ~1 minute for GitHub to update.

✅ **Check:** open your app link, make a song through the wizard, and pay the
(still-simulated) $4.99 button. This time, after the loading screen, you should
hear a **real generated song**, not the demo tone. 🎉

---

## Now your colleagues can make real songs

Send them the app link (`https://YOURNAME.github.io/musyx/`) and tell them to
install it (steps are in the DEMO-GUIDE). Every song they make is real and comes
out of your shared WaveSpeed credit. No setup for them — they just use the app.

---

## Watching your spending

- Each song ≈ **$0.05**. Your **$20 free credit ≈ 400 songs**.
- Check your balance anytime on the WaveSpeed dashboard.
- When credit runs low, top up a few dollars. No subscription.
- The app already has cost tracking built in — open the browser console and
  type `MusyxAI.cost.summary()` to see spend and savings.

---

## If something doesn't work

- **Still hear the demo tone?** The `API_ENDPOINT` line probably has a typo, or
  you forgot `/generate` at the end, or GitHub hasn't finished updating (wait a
  minute and refresh).
- **Error / no song?** Check the key is saved in Cloudflare as a Secret named
  exactly `MUSIC_API_KEY`, and that your WaveSpeed account has credit.
- **Want to check the middleman is alive?** Open your worker URL in a browser
  (without `/generate`). It should show a small `{"ok":true}` message.
- **Nothing works and you're stuck?** Switch `API_ENDPOINT` back to `""` (empty)
  and re-commit — the app returns to safe demo mode so you can still show it.

---

## What's real vs. still simulated (so you can tell testers)

- **Real now (after this setup):** the song itself — actual AI-generated music
  from your prompts.
- **Still simulated:** the payment. The $4.99 button doesn't charge anyone yet;
  it just triggers generation. Real payments (Stripe, M-Pesa, e-Mola) need the
  backend, which is a separate future step.

So: real songs, simulated checkout. Perfect for testing and demos.
