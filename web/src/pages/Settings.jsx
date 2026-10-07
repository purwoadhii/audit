import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { ErrorBox, Loading, useLoad, useToast } from '../components/ui.jsx';

const THEME_LABEL = { teal: 'Teal', biru: 'Biru', hijau: 'Hijau', ungu: 'Ungu', merah: 'Merah', oranye: 'Oranye' };
const THEME_COLOR = { teal: '#2BB39A', biru: '#4C8DF0', hijau: '#4CB86A', ungu: '#8B78E6', merah: '#E5675B', oranye: '#EE9440' };

const SECTIONS = [
  { title: 'Tampilan', keys: ['app_name', 'app_tagline', 'theme', 'login_title', 'login_subtitle', 'login_hero_title', 'login_hero_text', 'forgot_password_text'] },
  { title: 'Data master', keys: ['units', 'audit_types'] },
  { title: 'Keamanan login', keys: ['session_idle_minutes', 'remember_max_days', 'max_login_attempts'] },
  { title: 'Mode perbaikan', keys: ['maintenance', 'maintenance_message'] },
];

const HINT = {
  units: 'Satu unit per baris. Muncul sebagai pilihan saat mengisi unit audit dan unit pengguna.',
  audit_types: 'Satu jenis per baris. Audit lama dengan jenis yang dihapus tetap tersimpan.',
  session_idle_minutes: 'Tanpa "Ingat saya", pengguna otomatis keluar bila tidak aktif selama ini.',
  remember_max_days: 'Dengan "Ingat saya", sesi bertahan sampai browser ditutup, paling lama sekian hari.',
  max_login_attempts: 'Percobaan gagal per username dan alamat IP dalam 15 menit sebelum login dikunci.',
  maintenance: 'Saat aktif, hanya Infra Admin yang bisa masuk. Pengguna lain melihat pesan di bawah.',
  app_tagline: 'Tampil di bawah nama aplikasi dan di bagian bawah kartu login.',
};

const LONG = ['login_hero_text', 'forgot_password_text', 'maintenance_message', 'login_subtitle'];

function Field({ k, meta, value, onChange, themes, locked }) {
  const label = <>{meta.label}{locked && <span className="locked"> · hanya Infra Admin</span>}</>;
  if (k === 'theme') {
    return (
      <div className="full">
        <span className="lbl">{label}</span>
        <div className="swatches" role="group" aria-label="Tema warna">
          {themes.map((t) => (
            <button type="button" key={t} className="swatch" aria-pressed={value === t} onClick={() => onChange(t)} disabled={locked}>
              <i style={{ background: THEME_COLOR[t] }} />{THEME_LABEL[t] || t}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (Array.isArray(meta.default)) {
    return (
      <label>{label}
        <textarea id={`s-${k}`} rows={6} disabled={locked} value={value.join('\n')} onChange={(e) => onChange(e.target.value.split('\n'))} />
        {HINT[k] && <span className="hint">{HINT[k]}</span>}
      </label>
    );
  }
  if (typeof meta.default === 'boolean') {
    return (
      <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input id={`s-${k}`} type="checkbox" style={{ width: 'auto' }} disabled={locked} checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}{HINT[k] && <span className="hint" style={{ display: 'block' }}>{HINT[k]}</span>}</span>
      </label>
    );
  }
  if (typeof meta.default === 'number') {
    return (
      <label>{label}{k === 'session_idle_minutes' ? ' (menit)' : k === 'remember_max_days' ? ' (hari)' : ''}
        <input id={`s-${k}`} type="number" disabled={locked} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
        {HINT[k] && <span className="hint">{HINT[k]}</span>}
      </label>
    );
  }
  const long = LONG.includes(k);
  return (
    <label className={long ? 'full' : ''}>{label}
      {long
        ? <textarea id={`s-${k}`} rows={2} disabled={locked} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input id={`s-${k}`} disabled={locked} value={value} onChange={(e) => onChange(e.target.value)} />}
      {HINT[k] && <span className="hint">{HINT[k]}</span>}
    </label>
  );
}

function Section({ title, keys, data, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const pick = () => Object.fromEntries(keys.map((k) => [k, data.values[k]]));
  const [f, setF] = useState(pick);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setF(pick()), [data]);
  const lockedKey = (k) => data.meta[k].who === 'infraadmin' && user.role !== 'infraadmin';
  const editable = keys.filter((k) => !lockedKey(k));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = Object.fromEntries(editable.map((k) => [k, Array.isArray(f[k]) ? f[k].map((x) => x.trim()).filter(Boolean) : f[k]]));
      await api.patch('/settings', body);
      toast(`${title} disimpan`);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form" onSubmit={submit} aria-label={title}>
      <h3 className="full" style={{ margin: 0 }}>{title}</h3>
      {keys.map((k) => (
        <Field key={k} k={k} meta={data.meta[k]} value={f[k]} themes={data.themes} locked={lockedKey(k)} onChange={(v) => setF({ ...f, [k]: v })} />
      ))}
      {error && <div className="error-text full" role="alert">{error}</div>}
      {editable.length > 0 && <div className="form-foot full"><button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>}
    </form>
  );
}

export default function Settings() {
  const { reload: reloadApp } = useSettings();
  const { data, error, loading, reload } = useLoad(() => api.get('/settings'), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const saved = () => { reload(); reloadApp(); };
  return (
    <div className="settings-grid">
      {SECTIONS.map((s) => <Section key={s.title} {...s} data={data} onSaved={saved} />)}
    </div>
  );
}
