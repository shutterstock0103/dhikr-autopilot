// Picks 3 zikar, records the video, uploads it to YouTube, and saves the history.
import fs from 'node:fs';
import { p, readJson, writeJson, nowMs, summary } from './lib.mjs';
import { pickZikar, chooseStyle } from './pick.mjs';
import { renderVideo } from './render.mjs';
import { uploadVideo } from './upload.mjs';

const dry = process.env.DRY_RUN === 'true';
const cfg = readJson(p('config.json'));
const zikar = readJson(p('data/zikar.json'));
const history = readJson(p('state/history.json'), { uploads: [] });

const picked = await pickZikar({ cfg, zikar, history });
const style = chooseStyle(cfg, history);
console.log(`[make] picked (${picked.source}): ${picked.items.map((z) => z.id).join(', ')}`);
console.log(`[make] title: ${picked.title}`);

const outDir = p('out');
fs.rmSync(outDir, { recursive: true, force: true });
const { file, seconds } = await renderVideo({ items: picked.items, cfg, style, outDir });

if (dry) {
  fs.writeFileSync(p('out/description.txt'), `${picked.title}\n\n${picked.description}\n`);
  console.log('[make] dry run: video saved in out/, nothing was uploaded');
  summary(`Dry run finished. Video (${seconds.toFixed(0)}s) is in the "video" artifact.\n\nTitle: ${picked.title}`);
  process.exit(0);
}

const videoId = await uploadVideo({ file, title: picked.title, description: picked.description, tags: cfg.tags, privacy: cfg.privacy });
console.log(`[make] uploaded: https://youtube.com/shorts/${videoId}`);

history.uploads.push({ at: nowMs(), ids: picked.items.map((z) => z.id), title: picked.title, videoId, privacy: cfg.privacy, style });
history.uploads = history.uploads.slice(-200);
writeJson(p('state/history.json'), history);
summary(`Posted: https://youtube.com/shorts/${videoId}\n\nTitle: ${picked.title}\n\nZikar: ${picked.items.map((z) => z.tr).join(', ')}`);
