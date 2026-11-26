// Chooses the zikar for the next video, and the style of the video.
// The Arabic text ALWAYS comes from data/zikar.json. The AI may only choose ids and suggest a title.

const SCENES = ['tasbih', 'mosque', 'mandala', 'orb', 'minimal', 'mix'];
const SFX = ['bead', 'wood', 'bell'];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

function randomPick(candidates, n, recentIds) {
  const fresh = shuffle(candidates.filter((z) => !recentIds.has(z.id)));
  const stale = shuffle(candidates.filter((z) => recentIds.has(z.id)));
  return [...fresh, ...stale].slice(0, n);
}

async function askLLM(cfg, system, user) {
  const provider = cfg.llm?.provider || 'none';
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY; if (!key) throw new Error('OPENAI_API_KEY is not set');
    const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.llm.model || 'gpt-4o-mini', temperature: 0.9, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()).choices[0].message.content;
  }
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.llm.model || 'claude-haiku-5-5', max_tokens: 400, system, messages: [{ role: 'user', content: user }] })
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()).content[0].text;
  }
  throw new Error('no AI provider configured');
}

const parseJson = (text) => { const m = String(text).match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : text); };

export async function pickZikar({ cfg, zikar, history }) {
  const n = Number(cfg.zikarPerVideo) || 3;
  const disabled = new Set(cfg.disabledIds || []);
  let candidates = zikar.filter((z) => !disabled.has(z.id));
  // Very long Arabic gets tiny on a phone screen, so prefer shorter ones when there are enough.
  const maxCh = Number(cfg.maxArabicChars) || 0;
  if (maxCh) { const shorter = candidates.filter((z) => z.ar.length <= maxCh); if (shorter.length >= n) candidates = shorter; }
  if (candidates.length < n) throw new Error(`Only ${candidates.length} zikar are enabled, need at least ${n}.`);
  const recentIds = new Set(history.uploads.slice(-12).flatMap((u) => u.ids || []));

  let chosen = null, title = null, source = 'random';
  if ((cfg.llm?.provider || 'none') !== 'none') {
    try {
      const list = candidates.map((z) => `${z.id} | ${z.kind || ''} | ${z.en}`).join('\n');
      const system = 'You help make short, calm dhikr (remembrance of Allah) counting videos. You only choose from the list you are given. You never write Arabic text.';
      const user = `Choose exactly ${n} different ids from this list so they flow well together in one short video. Prefer a good mix of kinds and avoid these recently used ids: ${[...recentIds].join(', ') || 'none'}.\n` +
        `Also write a short calm title in English (max 60 characters, no emojis, no hashtags, no promises or claims about rewards).\n` +
        `Return only JSON like {"ids":["id1","id2","id3"],"title":"..."}.\n\nList:\n${list}`;
      const out = parseJson(await askLLM(cfg, system, user));
      const byId = new Map(candidates.map((z) => [z.id, z]));
      const ids = Array.isArray(out.ids) ? [...new Set(out.ids)] : [];
      if (ids.length === n && ids.every((id) => byId.has(id))) {
        chosen = ids.map((id) => byId.get(id)); source = cfg.llm.provider;
        if (typeof out.title === 'string' && out.title.trim() && out.title.trim().length <= 70) title = out.title.trim().replace(/#\w+/g, '').trim();
      } else console.log('[pick] AI returned invalid ids, using random pick instead');
    } catch (e) { console.log(`[pick] AI step failed (${e.message}), using random pick instead`); }
  }
  if (!chosen) chosen = randomPick(candidates, n, recentIds);

  const GENERIC = ['Daily Dhikr Counter', 'Remember Allah with this Dhikr', 'Dhikr for a Peaceful Heart', 'Short Dhikr Reminder', 'Dhikr and Dua Counter'];
  const allShort = chosen.every((z) => z.tr.length <= 26);
  const base = title || (allShort ? chosen.map((z) => z.tr).join(' • ') : GENERIC[Math.floor(Math.random() * GENERIC.length)]);
  const generic = !title && !allShort;
  let fullTitle = generic ? `${base} #Shorts` : `${base} | Dhikr Counter #Shorts`;
  if (fullTitle.length > 100) fullTitle = `${base.slice(0, 100 - 11)} #Shorts`;

  const tags = (cfg.tags || []).map((t) => '#' + t.replace(/\s+/g, '')).filter((t) => t.toLowerCase() !== '#shorts');
  const lines = chosen.map((z, i) => `${i + 1}. ${z.ar}\n   ${z.tr}\n   ${z.en}`).join('\n\n');
  const description = `${base}\n\n${lines}\n\nCount along with the beads, ${cfg.countPerZikar} times each.\n\n#Shorts ${tags.join(' ')}`.slice(0, 4900);

  return { items: chosen, title: fullTitle, description, source };
}

export function chooseStyle(cfg, history) {
  if (!cfg.randomizeStyle) return { ...cfg.style };
  const last = history.uploads.length ? history.uploads[history.uploads.length - 1].style : null;
  const pickDifferent = (arr, prev) => { const opts = arr.filter((x) => x !== prev); return opts[Math.floor(Math.random() * opts.length)]; };
  return {
    scene: pickDifferent(SCENES, last?.scene),
    look: Math.random() < 0.75 ? 'night' : 'bright',
    sfx: pickDifferent(SFX, last?.sfx),
    theme: Math.random() < 0.4 ? 'auto' : Math.floor(Math.random() * 10)
  };
}
