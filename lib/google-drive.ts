// Server-side only. Uploads a photobooth session into its own Google Drive folder.
//
// Uses the photobooth owner's Google account through an OAuth refresh token
// (scope drive.file: the app only sees files it created). Run
// `node scripts/google-drive-auth.mjs` once to get the values for .env.local:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export function driveConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN &&
      process.env.GOOGLE_DRIVE_FOLDER_ID
  );
}

let cached: { token: string; expires: number } | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with a timeout and retries. The kiosk's internet can drop for a moment
 * ("fetch failed", slow DNS) and Google sometimes answers 429/5xx.
 */
async function fetchRetry(url: string, init: RequestInit, tries = 4, timeoutMs = 30_000): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if ((res.status === 429 || res.status >= 500) && i < tries) {
        await sleep(1000 * i);
        continue;
      }
      return res;
    } catch (err) {
      if (i >= tries) throw new Error(`Tidak bisa terhubung ke Google (${(err as Error).message})`);
      await sleep(1000 * i);
    }
  }
}

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const res = await fetchRetry(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google menolak login (${data.error ?? res.status})`);
  cached = { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function api<T>(url: string, init: RequestInit): Promise<T> {
  const token = await accessToken();
  const res = await fetchRetry(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Drive error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function createFolder(name: string, parent: string) {
  return api<{ id: string }>(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }),
  });
}

/** Resumable upload, so large videos go through in one piece. */
async function uploadFile(folderId: string, name: string, type: string, data: Buffer) {
  const token = await accessToken();
  const start = await fetchRetry(`${UPLOAD}?uploadType=resumable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': type,
      'X-Upload-Content-Length': String(data.length),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const location = start.headers.get('location');
  if (!start.ok || !location) throw new Error(`Google Drive menolak unggahan ${name} (${start.status})`);
  const put = await fetchRetry(
    location,
    { method: 'PUT', headers: { 'Content-Type': type, 'Content-Length': String(data.length) }, body: new Uint8Array(data) },
    3,
    120_000
  );
  if (!put.ok) throw new Error(`Unggahan ${name} gagal (${put.status})`);
}

/** Anyone with the link can view: that is what the QR hands to the guest. */
async function shareWithLink(fileId: string) {
  await api(`${API}/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
}

export interface DriveFile {
  name: string;
  type: string;
  data: Buffer;
}

/** Creates one folder for the session, uploads every file, returns the folder link. */
export async function uploadSessionToDrive(files: DriveFile[]): Promise<string> {
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', ' ').slice(0, 16).replace(':', '.');
  const folder = await createFolder(`KulitYea ${stamp}`, process.env.GOOGLE_DRIVE_FOLDER_ID!);
  for (const f of files) await uploadFile(folder.id, f.name, f.type, f.data);
  await shareWithLink(folder.id);
  return `https://drive.google.com/drive/folders/${folder.id}`;
}
