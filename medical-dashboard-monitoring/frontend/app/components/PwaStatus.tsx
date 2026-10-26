'use client';

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';

export default function PwaStatus() {
  const [offline, setOffline] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const set = () => setOffline(!navigator.onLine);
    set(); window.addEventListener('online', set); window.addEventListener('offline', set);
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then((reg) => {
      setRegistration(reg);
      if (reg.waiting) setUpdateReady(true);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(true);
        });
      });
    });
    return () => {
      window.removeEventListener('online', set);
      window.removeEventListener('offline', set);
    };
  }, []);

  if (!offline && !updateReady) return null;
  return <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl text-sm text-neutral-800">
    <div className="flex items-start gap-3">
      {offline ? <CloudOff className="text-warning shrink-0" size={19} /> : <RefreshCw className="text-accent shrink-0" size={19} />}
      <div><strong>{offline ? 'Koneksi offline' : 'Versi baru tersedia'}</strong><p className="mt-1 text-xs text-neutral-500">{offline ? 'Data dinamis dan perintah robot ditahan sampai koneksi kembali.' : 'Perbarui saat aman. Tidak ada perintah robot yang diantrekan.'}</p>
        {updateReady && <button onClick={() => { registration?.waiting?.postMessage({ type: 'SKIP_WAITING' }); window.location.reload(); }} className="mt-3 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white">Perbarui aplikasi</button>}
      </div>
    </div>
  </div>;
}
