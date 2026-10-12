import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { ConfirmDelete, ErrorBox, Loading, useLoad, useToast } from '../components/ui.jsx';
import { N_, T, t } from '../i18n.jsx';

const THEME_LABEL = { teal: N_('Teal'), biru: N_('Biru'), hijau: N_('Hijau'), ungu: N_('Ungu'), merah: N_('Merah'), oranye: N_('Oranye') };
// Contoh warna: bilah atas dan aksen tiap tema.
const THEME_COLOR = {
  teal: ['#102A3C', '#2BB39A'], biru: ['#102447', '#4C8DF0'], hijau: ['#112D20', '#4CB86A'],
  ungu: ['#241B47', '#8B78E6'], merah: ['#3A161A', '#E5675B'], oranye: ['#3A240F', '#EE9440'],
};

const SECTIONS = [
  { title: N_('Tampilan'), keys: ['app_name', 'app_tagline', 'theme', 'login_title', 'login_subtitle', 'login_hero_title', 'login_hero_text', 'forgot_password_text'] },
  { title: N_('Data master'), keys: ['units', 'audit_types'] },
  { title: N_('Dokumen'), keys: ['ocr_enabled'] },
  { title: N_('Keamanan login'), keys: ['session_idle_minutes', 'remember_max_days'] },
];

// Pengaturan teknis di halaman Infra Admin.
const INFRA_SECTIONS = [
  { title: N_('Batas percobaan login'), keys: ['max_login_attempts'] },
  { title: N_('Mode perbaikan'), keys: ['maintenance', 'maintenance_message'] },
];

const HINT = {
  units: N_('Satu unit per baris. Muncul sebagai pilihan saat mengisi unit audit dan unit pengguna.'),
  audit_types: N_('Satu jenis per baris. Audit lama dengan jenis yang dihapus tetap tersimpan.'),
  session_idle_minutes: N_('Tanpa "Ingat saya", pengguna otomatis keluar bila tidak aktif selama ini.'),
  remember_max_days: N_('Dengan "Ingat saya", sesi bertahan sampai browser ditutup, paling lama sekian hari.'),
  max_login_attempts: N_('Percobaan gagal per username dan alamat IP dalam 15 menit sebelum login dikunci.'),
  maintenance: N_('Saat aktif, hanya Infra Admin yang bisa masuk. Pengguna lain melihat pesan di bawah.'),
  ocr_enabled: N_('Teks gambar dan PDF hasil scan dibaca otomatis saat diunggah, supaya isinya bisa dicari lewat Asisten AI. Word, Excel, PowerPoint, dan PDF biasa selalu dibaca.'),
  app_tagline: N_('Tampil di bawah nama aplikasi dan di bagian bawah kartu login.'),
};

const LONG = ['login_hero_text', 'forgot_password_text', 'maintenance_message', 'login_subtitle'];

function Field({ k, meta, value, onChange, themes, locked }) {
  const label = <>{t(meta.label)}{locked && <span className="locked"> · {t('hanya Infra Admin')}</span>}</>;
  if (k === 'theme') {
    return (
      <div className="full">
        <span className="lbl">{label}</span>
        <div className="swatches" role="group" aria-label={t('Tema warna')}>
          {themes.map((name) => (
            <button type="button" key={name} className="swatch" aria-pressed={value === name} onClick={() => onChange(name)} disabled={locked}>
              <i style={{ background: `linear-gradient(90deg, ${THEME_COLOR[name][0]} 50%, ${THEME_COLOR[name][1]} 50%)` }} />{t(THEME_LABEL[name]) || name}
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
        {HINT[k] && <span className="hint">{t(HINT[k])}</span>}
      </label>
    );
  }
  if (typeof meta.default === 'boolean') {
    return (
      <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input id={`s-${k}`} type="checkbox" style={{ width: 'auto' }} disabled={locked} checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}{HINT[k] && <span className="hint" style={{ display: 'block' }}>{t(HINT[k])}</span>}</span>
      </label>
    );
  }
  if (typeof meta.default === 'number') {
    return (
      <label>{k === 'session_idle_minutes' ? <T k="{label} (menit)" label={label} /> : k === 'remember_max_days' ? <T k="{label} (hari)" label={label} /> : label}
        <input id={`s-${k}`} type="number" disabled={locked} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
        {HINT[k] && <span className="hint">{t(HINT[k])}</span>}
      </label>
    );
  }
  const long = LONG.includes(k);
  return (
    <label className={long ? 'full' : ''}>{label}
      {long
        ? <textarea id={`s-${k}`} rows={2} disabled={locked} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input id={`s-${k}`} disabled={locked} value={value} onChange={(e) => onChange(e.target.value)} />}
      {HINT[k] && <span className="hint">{t(HINT[k])}</span>}
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
      toast(t('{title} disimpan', { title: t(title) }));
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form" onSubmit={submit} aria-label={t(title)}>
      <h3 className="full" style={{ margin: 0 }}>{t(title)}</h3>
      {keys.map((k) => (
        <Field key={k} k={k} meta={data.meta[k]} value={f[k]} themes={data.themes} locked={lockedKey(k)} onChange={(v) => setF({ ...f, [k]: v })} />
      ))}
      {keys.includes('ocr_enabled') && !(user.features || []).includes('ocr') && (
        <div className="notice full">{t('Lisensi saat ini Standar, jadi OCR gambar dan PDF hasil scan tidak berjalan. OCR tersedia di lisensi Pro.')}</div>
      )}
      {error && <div className="error-text full" role="alert">{error}</div>}
      {editable.length > 0 && <div className="form-foot full"><button className="btn primary" disabled={busy}>{busy ? t('Menyimpan…') : t('Simpan')}</button></div>}
    </form>
  );
}

const BACKGROUNDS = {
  login: {
    title: N_('Gambar latar login'),
    url: 'login_background_url',
    preview: N_('Pratinjau {name}. Belum disimpan: klik Simpan untuk memakainya di halaman login.'),
    removed: N_('Gambar latar dihapus, halaman login kembali ke tampilan bawaan'),
    confirm: N_('Hapus gambar latar? Tampilan halaman login kembali ke bawaan.'),
    hint: N_('Disarankan gambar mendatar minimal 1600 x 1000 piksel. Gambar mengisi panel kiri halaman login.'),
  },
  app: {
    title: N_('Gambar latar halaman aplikasi'),
    url: 'app_background_url',
    preview: N_('Pratinjau {name}. Belum disimpan: klik Simpan untuk memakainya di halaman setelah login.'),
    removed: N_('Gambar latar dihapus, halaman setelah login kembali ke tampilan bawaan'),
    confirm: N_('Hapus gambar latar? Tampilan halaman setelah login kembali ke bawaan.'),
    hint: N_('Disarankan gambar mendatar minimal 1920 x 1080 piksel. Gambar tampil di belakang isi halaman setelah login, di bawah bilah atas.'),
  },
};

// Gambar latar halaman login atau halaman setelah login.
// Gambar yang dipilih tampil dulu di pratinjau, baru tersimpan setelah klik Simpan.
function BackgroundSection({ kind, onSaved }) {
  const bg = BACKGROUNDS[kind];
  const { settings } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // { file, url } yang belum disimpan
  const saved = settings[bg.url];
  const url = pending?.url || saved;

  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError(t('Pilih gambar JPG, PNG, atau WebP.'));
    if (file.size > 5 * 1024 * 1024) return setError(t('Ukuran gambar maksimal 5 MB.'));
    setPending({ file, url: URL.createObjectURL(file) });
  }

  async function run(kind, action, message) {
    setBusy(kind);
    setError('');
    try {
      await action();
      setPending(null);
      toast(message);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const save = () => run('save', () => api.upload(`/settings/${kind}-background`, pending.file), t('{title} disimpan', { title: t(bg.title) }));
  const remove = () => run('delete', () => api.del(`/settings/${kind}-background`), t(bg.removed));

  return (
    <section className="panel form" aria-label={t(bg.title)}>
      <h3 className="full" style={{ margin: 0 }}>{t(bg.title)}</h3>
      {kind === 'login' ? (
        <div className="full bg-preview" aria-label={t('Pratinjau halaman login')}>
          <div className="left" style={url ? { backgroundImage: `url("${url}")` } : undefined}>{url ? '' : t('Tampilan bawaan')}</div>
          <div className="right"><i style={{ width: '45%' }} /><i /><i /><i className="btnlike" /></div>
        </div>
      ) : (
        <div className="full bg-preview app" aria-label={t('Pratinjau halaman setelah login')}>
          <div className="pv-bar" />
          <div className="pv-body" style={url ? { backgroundImage: `url("${url}")` } : undefined}>
            {!url && <span>{t('Tampilan bawaan')}</span>}
            <div className="cards"><i /><i /><i /></div>
          </div>
        </div>
      )}
      {pending && <div className="full hint" role="status">{t(bg.preview, { name: pending.file.name })}</div>}
      <div className="full upload-row">
        <label className="btn" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {pending || saved ? t('Pilih gambar lain') : t('Pilih gambar')}
          <input id={`bg-file-${kind}`} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={Boolean(busy)} onChange={pick} />
        </label>
        {pending && <>
          <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={save}>{busy === 'save' ? t('Menyimpan…') : t('Simpan')}</button>
          <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => setPending(null)}>{t('Batal')}</button>
        </>}
        {!pending && saved && (busy === 'delete'
          ? <button type="button" className="btn danger" disabled>{t('Menghapus…')}</button>
          : <ConfirmDelete question={t(bg.confirm)} onConfirm={remove} />)}
        <span className="hint">{t('JPG, PNG, atau WebP, maksimal 5 MB.')} {t(bg.hint)}</span>
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
      <BackgroundSection kind="login" onSaved={saved} />
      <BackgroundSection kind="app" onSaved={saved} />
      {SECTIONS.slice(1).map((s) => <Section key={s.title} {...s} data={data} onSaved={saved} />)}
    </div>
  );
}
