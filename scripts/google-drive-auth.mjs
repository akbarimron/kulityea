// One-time setup: connects the photobooth to your Google Drive.
//
// 1. Google Cloud Console > APIs & Services: enable "Google Drive API".
// 2. Credentials > Create credentials > OAuth client ID > Application type "Desktop app".
// 3. Run (PowerShell):
//      $env:GOOGLE_CLIENT_ID="..."; $env:GOOGLE_CLIENT_SECRET="..."; node scripts/google-drive-auth.mjs
// 4. Sign in in the browser, then copy the printed lines into .env.local.
//
// Scope drive.file: the photobooth only sees files and folders it creates itself.

import http from 'node:http';
import { exec } from 'node:child_process';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET dulu (lihat komentar di atas file ini).');
  process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://127.0.0.1:${PORT}`;
const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent',
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', redirectUri);
  const code = url.searchParams.get('code');
  if (!code) {
    res.end('Menunggu login Google...');
    return;
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.refresh_token) throw new Error(JSON.stringify(tokens));

    const folderRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'KulitYea Photobooth', mimeType: 'application/vnd.google-apps.folder' }),
    });
    const folder = await folderRes.json();
    if (!folder.id) throw new Error(JSON.stringify(folder));

    res.end('Berhasil. Kembali ke terminal untuk menyalin pengaturan.');
    console.log('\nTersambung. Folder "KulitYea Photobooth" sudah dibuat di Google Drive kamu.');
    console.log('Salin baris berikut ke kulityea/.env.local (dan ke Environment Variables di Vercel):\n');
    console.log(`GOOGLE_CLIENT_ID=${clientId}`);
    console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GOOGLE_DRIVE_FOLDER_ID=${folder.id}\n`);
  } catch (err) {
    res.end('Gagal. Lihat pesan di terminal.');
    console.error('Gagal menyambungkan Google Drive:', err.message);
  } finally {
    server.close();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Buka link ini untuk login Google (browser akan coba terbuka otomatis):\n');
  console.log(authUrl + '\n');
  const opener = process.platform === 'win32' ? `start "" "${authUrl}"` : process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
  exec(opener, () => undefined);
});
