import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  lanAddress,
  removeExpired,
  shareAvailability,
  shareDir,
  type ShareFile,
  type ShareKind,
  type ShareManifest,
} from '@/lib/share-store';
import { driveConfigured, uploadSessionToDrive } from '@/lib/google-drive';

/** Lets the kiosk ask, before uploading anything, whether phone sharing works here. */
export function GET() {
  return Response.json(shareAvailability());
}

const FIELDS: { field: ShareKind; base: string }[] = [
  { field: 'photo', base: 'foto' },
  { field: 'gif', base: 'gif' },
  { field: 'video', base: 'video' },
  { field: 'timelapse', base: 'timelapse' },
];

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

const MAX_FILE_BYTES = 60 * 1024 * 1024;

interface Incoming {
  kind: ShareKind;
  name: string;
  type: string;
  data: Buffer;
}

/**
 * Takes a finished session and returns the link for the QR:
 * a Google Drive folder when Drive is set up, otherwise a page on this laptop's Wi-Fi.
 */
export async function POST(request: Request) {
  if (!shareAvailability().available) {
    return Response.json({ error: 'cloud', message: 'QR hanya aktif saat photobooth dijalankan dari laptop kiosk.' }, { status: 501 });
  }
  const host = request.headers.get('host') ?? 'localhost:3000';
  const hostname = host.replace(/:\d+$/, '');
  // Guests' phones only read. Uploads come from the kiosk screen itself (opened as localhost).
  // On a cloud host with Drive set up there is no local screen, so uploads are allowed there.
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  const cloudDrive = Boolean(process.env.VERCEL) && driveConfigured();
  if (!local && !cloudDrive && process.env.KIOSK_ALLOW_REMOTE_UPLOAD !== '1') {
    return Response.json({ error: 'not-kiosk', message: 'Unggahan hanya diterima dari laptop kiosk.' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'bad-form', message: 'Data unggahan tidak terbaca.' }, { status: 400 });
  }

  const incoming: Incoming[] = [];
  for (const { field, base } of FIELDS) {
    const value = form.get(field);
    if (!(value instanceof Blob) || value.size === 0 || value.size > MAX_FILE_BYTES) continue;
    const type = value.type.split(';')[0];
    const ext = EXT[type];
    if (!ext) continue;
    incoming.push({ kind: field, name: `${base}.${ext}`, type, data: Buffer.from(await value.arrayBuffer()) });
  }
  if (!incoming.length) {
    return Response.json({ error: 'empty', message: 'Tidak ada file untuk dibagikan.' }, { status: 400 });
  }

  // 1. Google Drive: one folder per session.
  let driveError = '';
  if (driveConfigured()) {
    try {
      const url = await uploadSessionToDrive(incoming);
      return Response.json({ url, mode: 'drive' });
    } catch (err) {
      driveError = (err as Error).message;
      console.error('Google Drive upload failed:', driveError);
      if (process.env.VERCEL) {
        return Response.json({ error: 'drive', message: 'Gagal mengunggah ke Google Drive. Coba lagi.' }, { status: 502 });
      }
    }
  }

  // 2. Fallback: keep the files on this laptop and serve them over Wi-Fi.
  const port = host.includes(':') ? host.split(':').pop() : '';
  const configured = process.env.KIOSK_PUBLIC_URL?.replace(/\/$/, '');
  const ip = lanAddress();
  if (!configured && !ip) {
    return Response.json({ error: 'no-lan', message: 'Laptop kiosk belum tersambung ke WiFi.' }, { status: 503 });
  }
  const base = configured ?? `http://${ip}${port ? `:${port}` : ''}`;

  const id = randomUUID();
  const dir = shareDir(id);
  await fs.mkdir(dir, { recursive: true });
  const files: ShareFile[] = [];
  for (const f of incoming) {
    await fs.writeFile(path.join(dir, f.name), f.data);
    files.push({ kind: f.kind, name: f.name, type: f.type, size: f.data.length });
  }
  const manifest: ShareManifest = { createdAt: Date.now(), files };
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  removeExpired().catch(() => undefined);

  return Response.json({ id, url: `${base}/s/${id}`, mode: 'lan', ...(driveError ? { driveFailed: true } : {}) });
}
