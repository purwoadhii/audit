import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import LoginArt from '../components/LoginArt.jsx';
import { LogoIcon } from '../components/Icons.jsx';

const SAVED_KEY = 'am_username';

function readSaved() {
  try { return localStorage.getItem(SAVED_KEY) || ''; } catch { return ''; }
}

function Icon({ children }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function Login() {
  const { login } = useAuth();
  const { settings, reload } = useSettings();
  // Ambil ulang pengaturan saat halaman login dibuka, misalnya setelah mode perbaikan dinyalakan.
  useEffect(() => { reload(); }, [reload]);
  const [username, setUsername] = useState(readSaved);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => Boolean(readSaved()));
  const [showPw, setShowPw] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const u = username.trim();
    if (!u || !password) { setError('Username dan password wajib diisi.'); return; }
    setBusy(true);
    setError('');
    try {
      await login(u, password, remember);
      try {
        if (remember) localStorage.setItem(SAVED_KEY, u);
        else localStorage.removeItem(SAVED_KEY);
      } catch { /* penyimpanan browser tidak tersedia */ }
    } catch (err) {
      setError(err.message);
      setBusy(false);
      if (err.status === 503) reload();
    }
  }

  return (
    <div className="lp">
      <section className="lp-hero" aria-hidden="true">
        <div className="lp-art"><LoginArt /></div>
        <div className="lp-hero-text">
          {settings.login_hero_title && <h2>{settings.login_hero_title}</h2>}
          {settings.login_hero_text && <p>{settings.login_hero_text}</p>}
          <div className="lp-pills">
            <span>Perencanaan Audit</span>
            <span>Kertas Kerja</span>
            <span>Temuan &amp; Tindak Lanjut</span>
          </div>
        </div>
      </section>

      <main className="lp-side">
        <div className="lp-card">
          <div className="lp-inner">
            <div className="lp-brand">
              <div className="lp-brand-icon"><LogoIcon size={24} /></div>
              <div className="lp-brand-name">{settings.app_name}</div>
            </div>

            <h1>{settings.login_title}</h1>
            {settings.login_subtitle && <p className="lp-lead">{settings.login_subtitle}</p>}
            {settings.maintenance && <div className="lp-maint" role="status">{settings.maintenance_message}</div>}

            <form onSubmit={submit} noValidate>
              <label className="lp-label" htmlFor="username">Username</label>
              <div className="lp-field">
                <span className="lp-ico"><Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></Icon></span>
                <input id="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="contoh: budi.santoso" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>

              <label className="lp-label" htmlFor="password">Password</label>
              <div className="lp-field">
                <span className="lp-ico"><Icon><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon></span>
                <input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="Masukkan password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="lp-eye" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={showPw}>
                  {showPw
                    ? <Icon><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Icon>
                    : <Icon><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>}
                </button>
              </div>

              {error && <div className="lp-error" role="alert">{error}</div>}

              <div className="lp-row">
                <label className="lp-remember"><input id="remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Ingat saya</label>
                <button type="button" className="lp-link" onClick={() => setForgot(!forgot)} aria-expanded={forgot}>Forgot password?</button>
              </div>
              {forgot && <div className="lp-note" role="status">{settings.forgot_password_text}</div>}

              <button type="submit" className="lp-btn" disabled={busy}>{busy ? 'Memeriksa…' : 'Sign In'}</button>
            </form>

            <hr />
            <p className="lp-foot">{settings.app_tagline || settings.app_name}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
