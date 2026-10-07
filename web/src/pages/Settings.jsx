import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { ErrorBox, Loading, useLoad, useToast } from '../components/ui.jsx';

const THEME_LABEL = { teal: 'Teal', biru: 'Biru', hijau: 'Hijau', ungu: 'Ungu', merah: 'Merah', oranye: 'Oranye' };
// Contoh warna: bilah atas dan aksen tiap tema.
const THEME_COLOR = {
  teal: ['#102A3C', '#2BB39A'], biru: ['#102447', '#4C8DF0'], hijau: ['#112D20', '#4CB86A'],
  ungu: ['#241B47', '#8B78E6'], merah: ['#3A161A', '#E5675B'], oranye: ['#3A240F', '#EE9440'],
};

const SECTIONS = [
  { title: 'Tampilan', keys: ['app_name', 'app_tagline', 'theme', 'login_title', 'login_subtitle', 'login_hero_title', 'login_hero_text', 'forgot_password_text'] },
  { title: 'Data master', keys: ['units', 'audit_types'] },
  { title: 'Keamanan login', keys: ['session_idle_minutes', 'remember_max_days'] },
];

// Pengaturan teknis di halaman Infra Admin.
const INFRA_SECTIONS = [
  { title: 'Batas percobaan login', keys: ['max_login_attempts'] },
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
              <i style={{ background: `linear-gradient(90deg, ${THEME_COLOR[t][0]} 50%, ${THEME_COLOR[t][1]} 50%)` }} />{THEME_LABEL[t] || t}
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

// Unggah gambar latar halaman login. Pratinjau memakai tata letak login yang sama.
function BackgroundSection({ onSaved }) {
  const { settings } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = settings.login_background_url;

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('Ukuran gambar maksimal 5 MB.');
    setBusy(true);
    setError('');
    try {
      await api.upload('/settings/login-background', file);
      toast('Gambar latar login diperbarui');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api.del('/settings/login-background');
      toast('Kembali ke ilustrasi bawaan');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel form" aria-label="Gambar latar login">
      <h3 className="full" style={{ margin: 0 }}>Gambar latar login</h3>
      <div className="full bg-preview" aria-label="Pratinjau halaman login">
        <div className="left" style={url ? { backgroundImage: `url("${url}")` } : undefined}>{url ? '' : 'Ilustrasi bawaan'}</div>
        <div className="right"><i style={{ width: '45%' }} /><i /><i /><i className="btnlike" /></div>
      </div>
      <div className="full upload-row">
        <label className="btn primary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Mengunggah…' : url ? 'Ganti gambar' : 'Unggah gambar'}
          <input id="bg-file" type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={upload} />
        </label>
        {url && <button type="button" className="btn" disabled={busy} onClick={remove}>Pakai ilustrasi bawaan</button>}
        <span className="hint">JPG, PNG, atau WebP, maksimal 5 MB. Disarankan gambar mendatar minimal 1600 x 1000 piksel. Gambar mengisi panel kiri halaman login.</span>
      </div>
      {error && <div className="error-text full" role="alert">{error}</div>}
    </section>
  );
}

export default function Settings({ infra = false }) {
  const { reload: reloadApp } = useSettings();
  const { data, error, loading, reload } = useLoad(() => api.get('/settings'), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const saved = () => { reload(); reloadApp(); };
  if (infra) {
    return <div className="settings-grid">{INFRA_SECTIONS.map((s) => <Section key={s.title} {...s} data={data} onSaved={saved} />)}</div>;
  }
  return (
    <div className="settings-grid">
      <Section {...SECTIONS[0]} data={data} onSaved={saved} />
      <BackgroundSection onSaved={saved} />
      {SECTIONS.slice(1).map((s) => <Section key={s.title} {...s} data={data} onSaved={saved} />)}
    </div>
  );
}
