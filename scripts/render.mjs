// Opens the dhikr video maker page in a headless browser, fills it in, records the video, converts it for YouTube.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { p } from './lib.mjs';

export async function renderVideo({ items, cfg, style, outDir }) {
  const { chromium } = await import('playwright');
  fs.mkdirSync(outDir, { recursive: true });
  const html = p('renderer/dhikr-video-maker.html');
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[page error]', e.message));
    await page.goto(pathToFileURL(html).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof buildTimeline === 'function', null, { timeout: 30000 });
    await page.waitForTimeout(1500);

    const total = await page.evaluate(({ items, cfg, style }) => {
      try { localStorage.clear(); } catch (e) {}
      state.zikars = items.map((z) => ({ ar: z.ar, tr: z.tr, en: z.en, count: cfg.countPerZikar, theme: style.theme, scene: 'auto' }));
      state.scene = style.scene; state.look = style.look; state.sfx = style.sfx; state.sound = style.sfx !== 'off';
      state.beat = cfg.secondsPerBead; state.res = String(cfg.resolution || 720); state.brand = cfg.brand || ''; state.showof = true;
      return buildTimeline().total;
    }, { items, cfg, style });
    console.log(`[render] video length ${total.toFixed(1)}s, style ${JSON.stringify(style)}`);

    await page.click('#record');
    await page.waitForFunction(() => /^Done/.test(document.getElementById('status').textContent), null, { timeout: (total + 180) * 1000 });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#dl')]);
    const raw = path.join(outDir, 'raw' + path.extname(download.suggestedFilename() || '.webm'));
    await download.saveAs(raw);
    console.log(`[render] recorded ${(fs.statSync(raw).size / 1e6).toFixed(1)} MB`);

    const out = path.join(outDir, 'video.mp4');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { stdio: 'inherit' });

    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', out]).toString());
    const dur = Number(probe.format.duration), types = probe.streams.map((s) => s.codec_type);
    if (!(dur > total * 0.8) || !types.includes('video')) throw new Error(`Rendered video looks wrong (duration ${dur}s, streams ${types.join(',')})`);
    if (!types.includes('audio')) console.log('[render] warning: no audio track in the video');
    console.log(`[render] final video ${dur.toFixed(1)}s ${probe.streams[0].width}x${probe.streams[0].height}`);
    return { file: out, seconds: dur };
  } finally {
    await browser.close();
  }
}
