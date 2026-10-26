import type { Outputs } from './types';

export interface ShareResult {
  url: string;
  mode: 'drive' | 'lan';
  /** Some files were left out because the host refused the upload size. */
  partial?: boolean;
}

/** False when the app runs on a cloud host without Google Drive set up. */
export async function shareAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/share', { cache: 'no-store' });
    const data = (await res.json()) as { available?: boolean };
    return data.available !== false;
  } catch {
    return true;
  }
}

async function send(outputs: Outputs, withVideo: boolean) {
  const form = new FormData();
  const add = async (field: string, url?: string) => {
    if (!url) return;
    const blob = await (await fetch(url)).blob();
    form.append(field, blob, field);
  };
  await Promise.all([
    add('photo', outputs.photoUrl),
    add('gif', outputs.gifUrl),
    withVideo ? add('video', outputs.videoUrl) : undefined,
    withVideo ? add('timelapse', outputs.timelapseUrl) : undefined,
  ]);
  try {
    return await fetch('/api/share', { method: 'POST', body: form });
  } catch {
    throw new Error('Server photobooth tidak merespons.');
  }
}

/** Sends the finished files to the server and returns the link for the QR. */
export async function uploadSession(outputs: Outputs): Promise<ShareResult> {
  let res = await send(outputs, true);
  let partial = false;
  // Cloud hosts cap request size (Vercel: about 4.5 MB). Retry with the photo and GIF only.
  if (res.status === 413) {
    res = await send(outputs, false);
    partial = true;
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string; mode?: 'drive' | 'lan'; message?: string };
  if (!res.ok || !data.url) throw new Error(data.message ?? 'Gagal menyiapkan link unduhan.');
  return { url: data.url, mode: data.mode ?? 'lan', partial };
}
