// Server-side only: used by app/api/share and app/s/[id].
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Session files shared to guests' phones over the kiosk's own Wi-Fi.
 * Stored on the kiosk laptop, never uploaded anywhere else, removed after 24 hours.
 */

// Runtime-only data folder; keep the bundler from tracing the whole project.
export const SHARE_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), '.kiosk-shares');
export const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

export type ShareKind = 'photo' | 'gif' | 'video' | 'timelapse';

export interface ShareFile {
  kind: ShareKind;
  name: string;
  type: string;
  size: number;
}

export interface ShareManifest {
  createdAt: number;
  files: ShareFile[];
}

const ID_RE = /^[0-9a-f-]{36}$/;

/**
 * Wi-Fi sharing needs the app running on the kiosk laptop: a cloud host
 * (Vercel) can neither see the venue Wi-Fi nor keep files on its disk.
 */
export function shareAvailability(): { available: true } | { available: false; reason: 'cloud' } {
  const drive = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_DRIVE_FOLDER_ID
  );
  if (process.env.VERCEL && !drive) return { available: false, reason: 'cloud' };
  return { available: true };
}

export function isShareId(id: string) {
  return ID_RE.test(id);
}

export function shareDir(id: string) {
  if (!isShareId(id)) throw new Error('invalid id');
  return path.join(SHARE_DIR, id);
}

export async function readManifest(id: string): Promise<ShareManifest | null> {
  if (!isShareId(id)) return null;
  try {
    const raw = await fs.readFile(path.join(shareDir(id), 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw) as ShareManifest;
    if (Date.now() - manifest.createdAt > SHARE_TTL_MS) return null;
    return manifest;
  } catch {
    return null;
  }
}

export async function removeExpired() {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(SHARE_DIR);
  } catch {
    return;
  }
  await Promise.all(
    entries.filter(isShareId).map(async (id) => {
      const manifest = await readManifest(id);
      if (!manifest) await fs.rm(path.join(SHARE_DIR, id), { recursive: true, force: true });
    })
  );
}

function isPrivateLan(ip: string) {
  return /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

const VIRTUAL_IF = /vethernet|virtual|vmware|vbox|virtualbox|docker|hyper-v|wsl|tailscale|zerotier|vpn|loopback|bluetooth/i;
const WIFI_IF = /wi-?fi|wlan|wireless|wlp|airport/i;

/**
 * The kiosk's address on the local network. Phones join the Wi-Fi, so a Wi-Fi
 * adapter wins, then any real (non-virtual) adapter. Set KIOSK_PUBLIC_URL to override.
 */
export function lanAddress(): string | null {
  const found: { name: string; ip: string }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) found.push({ name, ip: addr.address });
    }
  }
  const real = found.filter((a) => !VIRTUAL_IF.test(a.name));
  const pick =
    real.find((a) => WIFI_IF.test(a.name) && isPrivateLan(a.ip)) ??
    real.find((a) => isPrivateLan(a.ip)) ??
    found.find((a) => isPrivateLan(a.ip)) ??
    found[0];
  return pick?.ip ?? null;
}
