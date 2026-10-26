'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Printer, RotateCcw } from 'lucide-react';
import { useBooth } from '@/lib/booth/store';
import { shareAvailable, uploadSession } from '@/lib/booth/share';
import { btnPrimary, btnSecondary } from '@/lib/ui';
import { sound } from '@/lib/audio';

const IDLE_SECONDS = 120;

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function MediaCard({ title, children, href, file }: { title: string; children: React.ReactNode; href: string; file: string }) {
  return (
    <figure className="flex flex-col overflow-hidden rounded-2xl bg-surface">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted [&>*]:absolute [&>*]:inset-0 [&>*]:h-full [&>*]:w-full">{children}</div>
      <figcaption className="flex items-center justify-between gap-2 p-3">
        <span className="text-sm font-semibold">{title}</span>
        <a href={href} download={file} className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-leaf hover:bg-leaf/10">
          <Download className="h-4 w-4" aria-hidden="true" />
          Unduh
        </a>
      </figcaption>
    </figure>
  );
}

type ShareState =
  | { status: 'loading' }
  | { status: 'ready'; url: string; drive: boolean; partial?: boolean }
  | { status: 'error'; message: string }
  | { status: 'unavailable' };

/** QR to this session's Google Drive folder, or to its download page on the kiosk's Wi-Fi. */
function ShareCard() {
  const outputs = useBooth((s) => s.outputs);
  const setOutputs = useBooth((s) => s.setOutputs);
  const [state, setState] = useState<ShareState>(
    outputs.shareUrl ? { status: 'ready', url: outputs.shareUrl, drive: outputs.shareUrl.includes('drive.google.com') } : { status: 'loading' }
  );
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    setState({ status: 'loading' });
    if (!(await shareAvailable())) return setState({ status: 'unavailable' });
    try {
      const result = await uploadSession(useBooth.getState().outputs);
      setOutputs({ shareUrl: result.url });
      setState({ status: 'ready', url: result.url, drive: result.mode === 'drive', partial: result.partial });
    } catch (err) {
      setState({ status: 'error', message: (err as Error).message });
    }
  }, [setOutputs]);

  useEffect(() => {
    if (startedRef.current || outputs.shareUrl || !outputs.photoUrl) return;
    startedRef.current = true;
    run();
  }, [outputs.shareUrl, outputs.photoUrl, run]);

  return (
    <section aria-live="polite" className="rounded-2xl bg-surface p-4">
      {state.status === 'ready' ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-semibold">{state.drive ? 'Pindai untuk buka di Google Drive' : 'Pindai untuk simpan ke HP'}</p>
          <div className="rounded-xl bg-white p-2">
            <QRCodeSVG value={state.url} size={176} fgColor="#16301C" level="M" title="QR link unduhan" />
          </div>
          <p className="text-sm text-ink-soft">
            {state.drive
              ? 'Semua foto dan video sesi ini ada di satu folder Google Drive.'
              : 'HP harus tersambung ke WiFi yang sama dengan laptop photobooth.'}
          </p>
          {state.partial && <p className="text-sm text-ink-soft">Video terlalu besar untuk diunggah dari sini, pakai tombol Unduh.</p>}
          <p className="break-all text-xs text-ink-soft">{state.url}</p>
        </div>
      ) : state.status === 'unavailable' ? (
        <div className="space-y-2">
          <p className="font-semibold">Simpan ke HP lewat QR belum aktif di sini</p>
          <p className="text-sm text-ink-soft">
            QR hanya bekerja saat photobooth dijalankan dari laptop kiosk di lokasi acara. Untuk sekarang, pakai tombol Unduh di halaman ini.
          </p>
        </div>
      ) : state.status === 'error' ? (
        <div className="space-y-3">
          <p className="font-semibold">QR belum bisa dibuat</p>
          <p className="text-sm text-ink-soft">{state.message}</p>
          <button onClick={run} className="h-11 text-sm font-semibold text-leaf underline underline-offset-4">
            Coba lagi
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="h-[192px] w-[192px] animate-pulse rounded-xl bg-muted" aria-hidden="true" />
          <p className="text-sm text-ink-soft">Menyiapkan QR...</p>
        </div>
      )}
    </section>
  );
}

export function ResultScreen() {
  const outputs = useBooth((s) => s.outputs);
  const resetSession = useBooth((s) => s.resetSession);
  const [idle, setIdle] = useState(IDLE_SECONDS);
  const id = stamp();
  const ext = outputs.videoExt ?? 'webm';

  useEffect(() => {
    if (idle <= 0) {
      resetSession();
      return;
    }
    const t = window.setTimeout(() => setIdle((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [idle, resetSession]);

  // Any touch on the page counts as activity.
  const keepAlive = () => setIdle(IDLE_SECONDS);

  return (
    <div className="flex min-h-dvh flex-col bg-base" onPointerDown={keepAlive}>
      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-start gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[auto_1fr_minmax(280px,340px)]">
        <div id="printable-photostrip" className="flex justify-center">
          {outputs.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={outputs.photoUrl} alt="Foto jadi" className="max-h-[78dvh] w-auto rounded-sm shadow-[0_10px_30px_rgba(22,48,28,0.18)]" />
          ) : (
            <p className="text-ink-soft">Foto belum tersedia.</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {outputs.gifUrl && (
            <MediaCard title="GIF" href={outputs.gifUrl} file={`kulityea-${id}.gif`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={outputs.gifUrl} alt="GIF dari semua foto" className="object-cover" />
            </MediaCard>
          )}
          {outputs.videoUrl && (
            <MediaCard title="Video bingkai" href={outputs.videoUrl} file={`kulityea-video-${id}.${ext}`}>
              <video src={outputs.videoUrl} autoPlay loop muted playsInline className="object-contain" />
            </MediaCard>
          )}
          {outputs.timelapseUrl && (
            <MediaCard title="Timelapse" href={outputs.timelapseUrl} file={`kulityea-timelapse-${id}.${ext}`}>
              <video src={outputs.timelapseUrl} autoPlay loop muted playsInline className="object-cover" />
            </MediaCard>
          )}
          {!outputs.videoUrl && !outputs.timelapseUrl && (
            <p className="text-sm text-ink-soft sm:col-span-2">Video tidak dibuat untuk sesi ini.</p>
          )}
        </div>

        <div className="lg:sticky lg:top-8">
          <h1 className="text-5xl font-extrabold leading-none">
            Fotomu
            <br />
            sudah jadi.
          </h1>
          <div className="mt-6">
            <ShareCard />
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {outputs.photoUrl && (
              <a href={outputs.photoUrl} download={`kulityea-foto-${id}.png`} onClick={() => sound.playTap()} className={btnPrimary}>
                <Download className="h-5 w-5" aria-hidden="true" />
                Unduh foto
              </a>
            )}
            <button
              onClick={() => {
                sound.playTap();
                window.print();
              }}
              disabled={!outputs.photoUrl}
              className={`${btnSecondary} disabled:opacity-40`}
            >
              <Printer className="h-5 w-5" aria-hidden="true" />
              Cetak foto
            </button>
            <button
              onClick={() => {
                sound.playTap();
                resetSession();
              }}
              className={btnSecondary}
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              Foto lagi
            </button>
          </div>
        </div>
      </main>

      <footer className="border-t border-ink/10 px-4 py-3 sm:px-8">
        <p className="mx-auto max-w-7xl text-sm text-ink-soft">
          Kembali ke awal dalam <b className="text-ink">{idle} detik</b> kalau layar tidak disentuh.
        </p>
      </footer>
    </div>
  );
}
