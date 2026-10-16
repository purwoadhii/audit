import { useEffect, useState } from 'react';
import { Icon } from './Icons.jsx';
import { N_, t } from '../i18n.jsx';

// Pesan dari service worker (sw.template.js) untuk data yang belum pernah dibuka saat offline; diterjemahkan lewat tServer.
N_('Anda sedang offline dan data ini belum pernah dibuka di perangkat ini.');

// Pemberitahuan saat aplikasi berjalan tanpa koneksi: data yang tampil adalah data terakhir yang
// pernah dibuka di perangkat ini, dan perubahan belum bisa disimpan.
export function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    const api = (e) => setOffline(e.detail.offline || navigator.onLine === false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('jejak-connection', api);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('jejak-connection', api);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline-bar" role="status">
      <Icon name="offline" size={16} />
      {t('Anda sedang offline. Yang tampil adalah data terakhir yang dibuka di perangkat ini. Perubahan bisa disimpan lagi setelah terhubung.')}
    </div>
  );
}
