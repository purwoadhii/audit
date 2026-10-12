import { useEffect, useRef, useState } from 'react';
import { LANGS, t, useLang } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';

// Tombol bahasa: bola dunia dan kode bahasa, membuka daftar bahasa. Pilihan disimpan ke akun bila sudah masuk.
export default function LangMenu({ className = '', up = false }) {
  const { lang } = useLang();
  const { changeLanguage } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef();
  const cur = LANGS.find((l) => l.code === lang) || LANGS[0];

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className={`lang-menu ${up ? 'up ' : ''}${className}`} ref={box}>
      <button type="button" className="btn lang-btn" aria-haspopup="menu" aria-expanded={open} title={t('Bahasa')} onClick={() => setOpen(!open)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
        </svg>
        <span>{cur.short}</span>
      </button>
      {open && (
        <div className="lang-list" role="menu" aria-label={t('Bahasa')}>
          {LANGS.map((l) => (
            <button key={l.code} type="button" role="menuitemradio" aria-checked={l.code === lang} lang={l.code}
              onClick={() => { setOpen(false); changeLanguage(l.code); }}>
              <span>{l.label}</span>{l.code === lang && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
