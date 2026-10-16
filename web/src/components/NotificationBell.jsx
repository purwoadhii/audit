import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDateTime } from '../util.js';
import { t } from '../i18n.jsx';

const POLL_MS = 60000;

// Kalimat notifikasi disimpan dalam bahasa Indonesia; status di dalamnya ikut diterjemahkan.
const message = (n) => t(n.text, { ...n.vars, status: n.vars?.status ? t(n.vars.status) : undefined });

// Lonceng notifikasi di bilah atas: jumlah belum dibaca, daftar terbaru, dan tautan ke audit atau temuannya.
export default function NotificationBell() {
  const nav = useNavigate();
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef();
  const list = useRef();

  const load = useCallback(() => api.get('/notifications').then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = btn.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: Math.max(8, document.documentElement.clientWidth - r.right) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!btn.current?.contains(e.target) && !list.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  async function openItem(n) {
    setOpen(false);
    if (!n.read_at) api.post('/notifications/read', { id: n.id }).then(setData).catch(() => {});
    if (n.link) nav(n.link);
  }

  return (
    <>
      <button ref={btn} type="button" className="btn bell-btn" aria-haspopup="menu" aria-expanded={open}
        aria-label={data.unread ? t('Notifikasi, {n} belum dibaca', { n: data.unread }) : t('Notifikasi')}
        onClick={() => { setOpen(!open); if (!open) load(); }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {data.unread > 0 && <span className="bell-count">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && createPortal(
        <div ref={list} className="bell-list" role="menu" aria-label={t('Notifikasi')} style={{ position: 'fixed', ...(pos || { visibility: 'hidden' }) }}>
          <div className="bell-head">
            <b>{t('Notifikasi')}</b>
            {data.unread > 0 && <button type="button" className="btn ghost small" onClick={() => api.post('/notifications/read', {}).then(setData)}>{t('Tandai semua dibaca')}</button>}
          </div>
          {data.items.length ? data.items.map((n) => (
            <button key={n.id} type="button" role="menuitem" className={n.read_at ? '' : 'unread'} onClick={() => openItem(n)}>
              <span>{message(n)}</span>
              <span className="t-sub">{fmtDateTime(n.created_at)}</span>
            </button>
          )) : <div className="t-sub bell-empty">{t('Belum ada notifikasi.')}</div>}
        </div>,
        document.body,
      )}
    </>
  );
}
