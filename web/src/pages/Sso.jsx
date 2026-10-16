import { useState } from 'react';
import { api } from '../api.js';
import { ROLES } from '../util.js';
import { ErrorBox, Loading, useLoad, useToast } from '../components/ui.jsx';
import { N_, t } from '../i18n.jsx';

const PROVIDER_LABEL = { google: N_('Google Workspace'), microsoft: N_('Microsoft Entra ID (Microsoft 365)'), oidc: N_('Penyedia OpenID Connect lain') };
// Langkah singkat di konsol penyedia untuk mendapatkan Client ID dan secret.
const STEPS = {
  google: [
    N_('Buka Google Cloud Console → APIs & Services → Credentials, lalu Create credentials → OAuth client ID.'),
    N_('Pilih jenis Web application dan tempel Redirect URI di bawah ke Authorized redirect URIs.'),
    N_('Salin Client ID dan Client secret ke form ini.'),
  ],
  microsoft: [
    N_('Buka Microsoft Entra admin center → App registrations → New registration.'),
    N_('Pilih platform Web dan tempel Redirect URI di bawah. Catat Directory (tenant) ID dan Application (client) ID.'),
    N_('Buat client secret di Certificates & secrets, lalu salin nilainya ke form ini.'),
  ],
  oidc: [
    N_('Buat aplikasi/client baru bertipe confidential (authorization code) di penyedia SSO Anda, misalnya Keycloak, Okta, atau Authentik.'),
    N_('Tempel Redirect URI di bawah, lalu isi alamat issuer, Client ID, dan Client secret di form ini.'),
  ],
};

export default function SsoSettings() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get('/admin/sso'), []);
  const [f, setF] = useState(null);
  const [secret, setSecret] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const form = f || { ...data, domains: (data.domains || []).join(', ') };
  const set = (k) => (e) => setF({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const body = () => ({ ...form, ...(secret ? { client_secret: secret } : {}) });

  async function run(kind) {
    setBusy(true);
    setMsg(null);
    try {
      if (kind === 'test') {
        const r = await api.post('/admin/sso/test', body());
        setMsg({ ok: true, text: t('Penyedia SSO bisa dihubungi: {issuer}', { issuer: r.issuer }) });
      } else {
        await api.put('/admin/sso', body());
        setSecret('');
        setF(null);
        toast(t('Pengaturan SSO disimpan'));
        reload();
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(data.redirect_uri); toast(t('Disalin')); } catch { /* clipboard tidak tersedia */ }
  }

  return (
    <form className="panel form" onSubmit={(e) => { e.preventDefault(); run('save'); }} aria-label={t('Login SSO')}>
      <p className="form-note full">{t('Pengguna (auditor, auditee, manajemen) bisa masuk dengan akun kantor lewat Google, Microsoft, atau penyedia OpenID Connect lain. Akun dicocokkan dengan alamat email, jadi email di aplikasi harus sama dengan email akun kantor. System Admin dan Infra Admin tetap masuk dengan kata sandi.')}</p>
      <label className="check-row full"><input id="sso-enabled" type="checkbox" checked={Boolean(form.enabled)} onChange={set('enabled')} />{t('Aktifkan login SSO')}</label>
      <div className="full swatches" role="radiogroup" aria-label={t('Penyedia')}>
        {data.providers.map((p) => <button type="button" key={p} className="swatch" aria-pressed={form.provider === p} onClick={() => setF({ ...form, provider: p })}>{t(PROVIDER_LABEL[p])}</button>)}
      </div>
      <ol className="full t-sub steps-list">{STEPS[form.provider].map((s) => <li key={s}>{t(s)}</li>)}</ol>
      <div className="full">
        <span className="lbl">{t('Redirect URI')}</span>
        <div className="addrow"><input readOnly value={data.redirect_uri} onFocus={(e) => e.target.select()} /><button type="button" className="btn" onClick={copy}>{t('Salin')}</button></div>
        <span className="hint">{t('Bila aplikasi diakses lewat domain lain (misalnya https://audit.perusahaan.co.id), isi APP_URL di .env supaya alamat ini benar.')}</span>
      </div>
      {form.provider === 'microsoft' && <label className="full">{t('Directory (tenant) ID')}<input id="sso-tenant" value={form.tenant || ''} onChange={set('tenant')} placeholder="00000000-0000-0000-0000-000000000000" /><span className="hint">{t('Kosongkan untuk mengizinkan akun dari organisasi Microsoft mana pun (tetap dibatasi domain email di bawah).')}</span></label>}
      {form.provider === 'oidc' && <label className="full">{t('Issuer')}<input id="sso-issuer" value={form.issuer || ''} onChange={set('issuer')} placeholder="https://sso.perusahaan.co.id/realms/kantor" /></label>}
      <label>{t('Client ID')}<input id="sso-client" value={form.client_id || ''} onChange={set('client_id')} /></label>
      <label>{t('Client secret')}<input id="sso-secret" type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={data.has_secret ? t('Tersimpan. Isi hanya untuk mengganti.') : ''} /></label>
      <label>{t('Tulisan tombol')}<input id="sso-label" value={form.button_label || ''} onChange={set('button_label')} placeholder={t('Contoh: Akun Kantor')} maxLength={40} /><span className="hint">{t('Tampil sebagai "Masuk dengan …" di halaman login.')}</span></label>
      <label>{t('Domain email yang diizinkan')}<input id="sso-domains" value={form.domains} onChange={set('domains')} placeholder="perusahaan.co.id" /><span className="hint">{t('Pisahkan dengan koma. Kosongkan untuk mengizinkan semua domain.')}</span></label>
      <label className="check-row full"><input id="sso-auto" type="checkbox" checked={Boolean(form.auto_create)} onChange={set('auto_create')} />{t('Buat akun otomatis saat email dari domain di atas belum terdaftar')}</label>
      {form.auto_create && (
        <label>{t('Peran akun baru')}
          <select id="sso-role" value={form.default_role} onChange={set('default_role')}>{data.roles.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select>
          <span className="hint">{t('Auditee baru belum punya unit. Atur unitnya di menu Pengguna.')}</span>
        </label>
      )}
      <label className="check-row full"><input id="sso-password" type="checkbox" checked={form.password_login !== false} onChange={set('password_login')} />{t('Pengguna masih boleh masuk dengan username dan kata sandi')}</label>
      {msg && <div className={`full ${msg.ok ? 'ok-text' : 'error-text'}`} role="status">{msg.text}</div>}
      <div className="form-foot full">
        <button type="button" className="btn" disabled={busy} onClick={() => run('test')}>{t('Cek koneksi')}</button>
        <button className="btn primary" disabled={busy}>{t('Simpan')}</button>
      </div>
    </form>
  );
}
