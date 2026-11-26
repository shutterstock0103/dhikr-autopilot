// Runs every hour. Decides whether it is time to make and post a video.
import { p, readJson, nowMs, ptDate, setOutput, summary } from './lib.mjs';

const cfg = readJson(p('config.json'));
const hist = readJson(p('state/history.json'), { uploads: [] });
const force = process.env.FORCE === 'true';
const dry = process.env.DRY_RUN === 'true';
const now = nowMs();

function decide() {
  if (!cfg.enabled && !force) return [false, 'paused (enabled is off in config.json)'];
  const last = hist.uploads.length ? hist.uploads[hist.uploads.length - 1].at : 0;
  const gapMs = (Number(cfg.everyHours) || 2) * 3600e3;
  // 10 minutes of tolerance: GitHub runs scheduled jobs a little late or early.
  if (!force && last && now - last < gapMs - 10 * 60e3) {
    const mins = Math.ceil((gapMs - (now - last)) / 60e3);
    return [false, `not due yet (next in about ${mins} min)`];
  }
  if (!dry) {
    const today = ptDate(now);
    const used = hist.uploads.filter((u) => ptDate(u.at) === today).length;
    const max = Number(cfg.maxUploadsPerDay) || 6;
    if (used >= max) return [false, `daily limit reached (${used}/${max} uploads today, YouTube quota resets at midnight Pacific time)`];
  }
  return [true, force ? 'posting now (manual)' : 'due'];
}

const [go, reason] = decide();
setOutput('go', go);
setOutput('reason', reason.replace(/\n/g, ' '));
if (!go) summary(`Skipped: ${reason}`);
