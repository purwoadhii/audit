import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { slug } from '../util.js';

export const Pill = ({ kind, value }) => <span className={`pill ${kind}-${slug(value)}`}>{value}</span>;
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
          <button type="button" className="btn ghost" onClick={onClose}>Tutup</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Tombol hapus dua langkah: klik pertama meminta konfirmasi di tempat.
export function ConfirmDelete({ label = 'Hapus', question, onConfirm, yes = 'Ya, hapus' }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="btn danger" onClick={() => setAsking(true)}>{label}</button>;
  return (
    <div className="confirm">
      <span>{question}</span>
      <button type="button" className="btn" onClick={() => setAsking(false)}>Batal</button>
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
  return <div className="empty"><b>Memuat…</b></div>;
}

export function ErrorBox({ error, retry }) {
  return (
    <div className="empty">
      <b>Data tidak bisa dimuat</b>
      {error?.message}
      {retry && <div className="empty-action"><button className="btn" onClick={retry}>Coba lagi</button></div>}
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
