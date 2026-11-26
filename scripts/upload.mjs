// Uploads a video to YouTube with the official Data API (resumable upload).
import fs from 'node:fs';
import { sleep } from './lib.mjs';

const TOKEN_URL = () => process.env.YT_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = () => process.env.YT_UPLOAD_URL || 'https://www.googleapis.com/upload/youtube/v3/videos';

async function accessToken() {
  const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) throw new Error('YT_CLIENT_ID, YT_CLIENT_SECRET and YT_REFRESH_TOKEN secrets are required');
  const res = await fetch(TOKEN_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET, refresh_token: YT_REFRESH_TOKEN, grant_type: 'refresh_token' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const hint = data.error === 'invalid_grant' ? ' (the refresh token expired or was revoked, make a new one and update the YT_REFRESH_TOKEN secret)' : '';
    throw new Error(`Google sign-in failed: ${res.status} ${data.error || ''} ${data.error_description || ''}${hint}`);
  }
  return data.access_token;
}

export async function uploadVideo({ file, title, description, tags, privacy }) {
  const token = await accessToken();
  const body = fs.readFileSync(file);
  const metadata = {
    snippet: { title: title.slice(0, 100), description: description.slice(0, 5000), tags: (tags || []).slice(0, 15), categoryId: '22', defaultLanguage: 'en' },
    status: { privacyStatus: privacy || 'public', selfDeclaredMadeForKids: false }
  };
  const init = await fetch(`${UPLOAD_URL()}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(body.length), 'X-Upload-Content-Type': 'video/mp4'
    },
    body: JSON.stringify(metadata)
  });
  if (!init.ok) {
    const text = await init.text();
    const hint = /quotaExceeded|uploadLimitExceeded/.test(text) ? ' (YouTube daily limit reached, try again after midnight Pacific time)' : '';
    throw new Error(`YouTube refused the upload request: ${init.status} ${text.slice(0, 400)}${hint}`);
  }
  const location = init.headers.get('location');
  if (!location) throw new Error('YouTube did not return an upload address');

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(location, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body });
      if (res.ok) { const data = await res.json(); if (!data.id) throw new Error('upload finished but no video id was returned'); return data.id; }
      if (res.status < 500) throw new Error(`YouTube rejected the video: ${res.status} ${(await res.text()).slice(0, 400)}`);
      lastErr = new Error(`YouTube server error ${res.status}`);
    } catch (e) { if (/rejected the video/.test(e.message)) throw e; lastErr = e; }
    await sleep(attempt * 4000);
  }
  throw lastErr;
}
