import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { slug } from '../util.js';
import { T, t } from '../i18n.jsx';

export const Pill = ({ kind, value }) => <span className={`pill ${kind}-${slug(value)}`}>{t(value)}</span>;
export const RiskPill = ({ value }) => <Pill kind="r" value={value} />;
export const StatusPill = ({ value }) => <Pill kind="s" value={value} />;

const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const timer = useRef();
  const show = useCallback((text, tone = 'info') => {
    setMsg({ text, tone });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && <div className={`toast ${msg.tone}`} role="status">{msg.text}</div>}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

export function Sheet({ title, onClose, children, actions }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h3>{title}</h3>
          {actions}
          <button type="button" className="btn ghost" onClick={onClose}>{t('Tutup')}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Tombol hapus dua langkah: klik pertama meminta konfirmasi di tempat.
export function ConfirmDelete({ label = t('Hapus'), question, onConfirm, yes = t('Ya, hapus') }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="btn danger" onClick={() => setAsking(true)}>{label}</button>;
  return (
    <div className="confirm">
      <span>{question}</span>
      <button type="button" className="btn" onClick={() => setAsking(null)}>{t('Batal')}</button>
      <button type="button" className="btn primary danger-fill" onClick={onConfirm}>{yes}</button>
    </div>
  );
}

export const Empty = ({ title, children, action, small }) => (
  <div className={`empty${small ? ' small' : ''}`}>
    {title && <b>{title}</b>}
    {children}
    {action && <div className="empty-action">{action}</div>}
  </div>
);

export function Loading() {
  return <div className="empty"><b>{t('Memuat…')}</b></div>;
}

export function ErrorBox({ error, retry }) {
  return (
    <div className="empty">
      <b>{t('Data tidak bisa dimuat')}</b>
      {error?.message}
      {retry && <div className="empty-action"><button className="btn" onClick={retry}>{t('Coba lagi')}</button></div>}
    </div>
  );
}

// Memuat data dari API dan menyediakan fungsi muat ulang.
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState({ data: null, error, loading: false }),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1), setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

// Tanda kolom wajib. Pembaca layar sudah tahu dari atribut required pada input.
export const Req = () => <span className="req" aria-hidden="true">*</span>;
export const ReqNote = () => <p className="form-note full"><T k="Kolom bertanda {mark} wajib diisi." mark={<Req />} /></p>;

// Membagi daftar panjang menjadi halaman. Halaman kembali ke 1 setiap kali filter (resetKey) berubah.
const PAGE_SIZES = [10, 25, 50, 100];
export function usePaged(rows, resetKey) {
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey, size]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  return { rows: rows.slice((cur - 1) * size, cur * size), page: cur, pages, size, total: rows.length, setPage, setSize };
}

// Nomor halaman yang ditampilkan: awal, akhir, dan dua di sekitar halaman aktif.
function pageList(page, pages) {
  const out = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) out.push(i);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}

export function Pager({ paged }) {
  const { page, pages, size, total, setPage, setSize } = paged;
  if (!total) return null;
  const from = (page - 1) * size + 1;
  return (
    <nav className="pager" aria-label={t('Halaman')}>
      <span className="t-sub num">{t('{a}–{b} dari {n}', { a: from, b: Math.min(total, page * size), n: total })}</span>
      <label className="t-sub">{t('Per halaman')}
        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
      </label>
      {pages > 1 && (
        <span className="pages">
          <button type="button" className="btn small" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label={t('Sebelumnya')}>‹</button>
          {pageList(page, pages).map((n, i) => (n === '…'
            ? <span key={`e${i}`} className="t-sub">…</span>
            : <button key={n} type="button" className={`btn small${n === page ? ' primary' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>))}
          <button type="button" className="btn small" disabled={page === pages} onClick={() => setPage(page + 1)} aria-label={t('Berikutnya')}>›</button>
        </span>
      )}
    </nav>
  );
}

// Tombol ubah dan hapus di ujung baris tabel. Klik di sini tidak ikut membuka baris.
// Konfirmasi hapus melayang di atas tabel (position fixed) supaya tidak terpotong kotak tabel.
export function RowActions({ onEdit, onDelete, question }) {
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);
  const stop = (e) => e.stopPropagation();
  useEffect(() => {
    if (!asking) return undefined;
    const close = () => setAsking(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [asking]);
  function ask(e) {
    if (asking) return setAsking(null);
    const r = e.currentTarget.getBoundingClientRect();
    const below = r.bottom + 130 < window.innerHeight;
    setAsking({ right: Math.max(8, window.innerWidth - r.right), ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) });
  }
  return (
    <div className="row-actions" onClick={stop}>
      {onEdit && <button type="button" className="btn small icon" title={t('Ubah')} aria-label={t('Ubah')} onClick={onEdit}><Icon name="edit" size={15} /></button>}
      {onDelete && <button type="button" className="btn small icon danger" title={t('Hapus')} aria-label={t('Hapus')} aria-expanded={Boolean(asking)} onClick={ask}><Icon name="trash" size={15} /></button>}
      {asking && (
        <div className="row-confirm" role="dialog" style={asking}>
          <p>{question}</p>
          <div>
            <button type="button" className="btn small" onClick={() => setAsking(null)}>{t('Batal')}</button>
            <button type="button" className="btn small danger-fill" disabled={busy}
              onClick={async () => { setBusy(true); try { await onDelete(); } finally { setBusy(false); setAsking(null); } }}>{t('Ya, hapus')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Tombol untuk pekerjaan yang butuh waktu (ekspor file): menampilkan "Menyiapkan…" dan pesan bila gagal.
export function BusyButton({ onClick, children, className = 'btn' }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function run() {
    setBusy(true);
    try { await onClick(); } catch (err) { toast(err.message || t('Terjadi kesalahan.'), 'error'); } finally { setBusy(false); }
  }
  return <button type="button" className={className} disabled={busy} onClick={run}>{busy ? t('Menyiapkan…') : children}</button>;
}
