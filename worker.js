/**
 * Musyx music-generation proxy — Cloudflare Worker.
 * --------------------------------------------------
 * WHY THIS EXISTS:
 *   Your API key must NEVER live in the web page (anyone could steal it).
 *   This tiny server holds the key and is the only thing that talks to the
 *   music provider. The app calls THIS, this calls the provider.
 *
 * DEPLOY (free, ~5 min, no credit card):
 *   1. Create a free account at https://dash.cloudflare.com
 *   2. Workers & Pages → Create → Worker → name it "musyx-api" → Deploy
 *   3. Edit code → paste this whole file → Deploy
 *   4. Worker → Settings → Variables → add a Secret:
 *         Name:  MUSIC_API_KEY
 *         Value: <your WaveSpeedAI key from https://wavespeed.ai>
 *   5. Copy your worker URL, e.g. https://musyx-api.YOURNAME.workers.dev
 *   6. In index.html set:  API_ENDPOINT: "https://musyx-api.YOURNAME.workers.dev/generate"
 *
 * SWITCH PROVIDERS: only the callProvider() function below changes.
 */

const ALLOWED_ORIGIN = '*'; // tighten to your GitHub Pages URL in production

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    ...extra,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });

    const url = new URL(request.url);

    try {
      // ---- start a generation ----
      if (request.method === 'POST' && url.pathname.endsWith('/generate')) {
        const bodyIn = await request.json();
        const { prompt, lyrics, durationSec } = bodyIn;
        if (!prompt) return json({ error: 'missing prompt' }, 400);
        const out = await startProvider(prompt, env, { lyrics, durationSec });
        // If the provider failed, return 502 with the readable reason (not a bare 500)
        if (out && out.error) return json(out, 502);
        return json(out);
      }

      // ---- poll a generation by id ----  GET /generate?id=...
      if (request.method === 'GET' && url.pathname.endsWith('/generate')) {
        const id = url.searchParams.get('id');
        if (!id) return json({ error: 'missing id' }, 400);
        const out = await pollProvider(id, env);
        return json(out);
      }

      // ---- LLM completion (Phase 4) ----  POST /llm
      // Holds the LLM key server-side, exactly like the music route. Dormant
      // until you add an LLM_API_KEY secret and point CONFIG.LLM_ENDPOINT here.
      if (request.method === 'POST' && url.pathname.endsWith('/llm')) {
        if (!env.LLM_API_KEY) return json({ error: 'llm not configured' }, 503);
        const body = await request.json();
        const out = await callLLM(body, env);
        return json(out);
      }

      // ---- DIAGNOSTIC ----  GET /check
      // Open this in a browser to test your setup without using the app.
      // It tells you whether the key exists and what WaveSpeed says back.
      if (request.method === 'GET' && url.pathname.endsWith('/check')) {
        if (!env.MUSIC_API_KEY) {
          return json({ ok: false, problem: 'MUSIC_API_KEY secret is MISSING in Worker settings' });
        }
        const test = await startProvider('afro house, upbeat, energetic, female vocals', env, { lyrics: '[inst]', durationSec: 10 });
        if (test.error) {
          return json({ ok: false, keyPresent: true, problem: test.error, detail: test.detail, hint: test.hint });
        }
        return json({ ok: true, keyPresent: true, message: 'Key works. Prediction started.', id: test.id });
      }

      return json({ ok: true, service: 'musyx-api' });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: cors() });
}

/* =======================================================================
   PROVIDER: WaveSpeedAI (open SongGeneration / LeVo model, ~$0.05/song)
   Docs: https://wavespeed.ai/docs/docs-api/wavespeed-ai/song-generation
   ======================================================================= */
async function startProvider(prompt, env, extra) {
  // Check the secret exists at all — the most common setup mistake.
  if (!env.MUSIC_API_KEY) {
    return { error: 'MUSIC_API_KEY secret is missing in the Worker settings' };
  }

  // ACE-Step 1.5: supports 50+ languages (incl. Portuguese), real duration up to
  // 240s, and full songs. Needs `tags` (comma-separated style) + `lyrics` (plural).
  // `tags` is the style description; we use the app's prompt string, which already
  // reads like comma-separated style tags (genre, mood, vocals, bpm).
  const tags = (prompt && String(prompt).trim())
    ? String(prompt).trim()
    : 'pop, upbeat, vocals';

  // Lyrics from the app (with [Verse]/[Chorus] markers). If none, make it instrumental.
  let lyrics = (extra && extra.lyrics && String(extra.lyrics).trim())
    ? String(extra.lyrics).trim()
    : '[inst]';

  // Duration: honour the requested length (seconds), clamp to the model's 5–240 range.
  let duration = 180; // default ~3 minutes
  if (extra && extra.durationSec && Number(extra.durationSec) > 0) {
    duration = Math.max(5, Math.min(240, Math.round(Number(extra.durationSec))));
  }

  const body = { tags, lyrics, duration, seed: -1 };

  const r = await fetch(
    'https://api.wavespeed.ai/api/v3/wavespeed-ai/ace-step-1.5',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + env.MUSIC_API_KEY,
      },
      body: JSON.stringify(body),
    }
  );

  // Read the raw reply as TEXT first, so we can report it even if it isn't JSON.
  const raw = await r.text();

  // If the provider rejected the request, surface exactly what it said.
  if (!r.ok) {
    return {
      error: 'WaveSpeed returned HTTP ' + r.status,
      detail: raw.slice(0, 500),
      hint:
        r.status === 401 || r.status === 403
          ? 'The API key is invalid or not activated. Check the key and your WaveSpeed credit.'
          : r.status === 402
          ? 'No credit on the WaveSpeed account. Top up and try again.'
          : 'See detail above for the provider message.',
    };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { error: 'WaveSpeed sent a non-JSON reply', detail: raw.slice(0, 500) };
  }

  const id = data?.data?.id || data?.id;
  if (!id) {
    return { error: 'No prediction id in the reply', detail: JSON.stringify(data).slice(0, 500) };
  }
  return { id };
}

async function pollProvider(id, env) {
  const r = await fetch(
    'https://api.wavespeed.ai/api/v3/predictions/' + id + '/result',
    { headers: { Authorization: 'Bearer ' + env.MUSIC_API_KEY } }
  );
  const data = await r.json();
  const status = data?.data?.status || data?.status;
  const outputs = data?.data?.outputs || data?.outputs;
  if (status === 'completed' && outputs && outputs[0]) {
    return { status: 'completed', audioUrl: outputs[0] };
  }
  if (status === 'failed') return { status: 'failed' };
  return { status: 'processing' };
}

/* =======================================================================
   LLM (Phase 4) — OpenAI-compatible chat completion.
   The prompt engine calls this to ENHANCE prompts and (Phase 5) lyrics.
   Returns { text, tokensIn, tokensOut } to match the llm-openai.js provider.
   To use a different LLM, change only the URL + body mapping below.
   Set the secret:  LLM_API_KEY   (and optionally LLM_MODEL)
   ======================================================================= */
async function callLLM(body, env) {
  const model = body.model || env.LLM_MODEL || 'gpt-4o-mini';
  const messages = [];
  if (body.system) messages.push({ role: 'system', content: body.system });
  messages.push({ role: 'user', content: body.user || '' });

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + env.LLM_API_KEY,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: body.temperature ?? 0.7,
      max_tokens: body.maxTokens ?? 600,
      // ask for strict JSON when the caller wants it
      ...(body.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return { error: 'llm http ' + r.status, detail };
  }
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return {
    text,
    tokensIn: data?.usage?.prompt_tokens,
    tokensOut: data?.usage?.completion_tokens,
  };
}
