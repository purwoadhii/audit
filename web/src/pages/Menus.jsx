import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';
import { ErrorBox, Loading, useLoad, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { t } from '../i18n.jsx';
import { MENUS } from '../menus.js';

// Sakelar: biru di kanan berarti menu tampil, abu-abu di kiri berarti menu disembunyikan.
function Switch({ id, on, disabled, onChange, label }) {
  return (
    <button type="button" id={id} role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`}
      disabled={disabled} onClick={() => onChange(!on)}>
      <span className="switch-knob" />
    </button>
  );
}

// System Admin → Pengaturan menu: menyalakan atau mematikan menu dan sub-menu aplikasi pengguna.
export default function MenuSettings() {
  const { reload: reloadApp } = useSettings();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get('/settings'), []);
  const [hidden, setHidden] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (data) setHidden(data.values.hidden_menus || []); }, [data]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!hidden) return <Loading />;

  const saved = data.values.hidden_menus || [];
  const dirty = JSON.stringify([...hidden].sort()) !== JSON.stringify([...saved].sort());
  const isOn = (key) => !hidden.includes(key);
  const set = (key, on) => setHidden(on ? hidden.filter((k) => k !== key) : [...hidden, key]);

  async function save() {
    setErr('');
    setBusy(true);
    try {
      await api.patch('/settings', { hidden_menus: hidden });
      toast(t('Pengaturan menu disimpan'));
      reload();
      reloadApp();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-grid">
      <p className="t-sub intro" style={{ margin: 0 }}>{t('Pilih menu yang tampil di aplikasi pengguna. Menu yang dimatikan disembunyikan untuk semua pengguna dan halamannya tidak bisa dibuka, tetapi datanya tetap tersimpan dan muncul lagi saat menunya dinyalakan. Menu tetap mengikuti hak akses setiap peran.')}</p>
      <div className="panel menu-list" aria-label={t('Pengaturan menu')}>
        {MENUS.map((m) => {
          const on = isOn(m.key);
          return (
            <div key={m.key} className="menu-group">
              <div className="menu-row">
                <span className="menu-name"><Icon name={m.icon} size={18} /><span><b>{t(m.label)}</b>{m.note && <span className="hint">{t(m.note)}</span>}</span></span>
                <span className={`menu-state${on ? ' on' : ''}`}>{on ? t('Tampil') : t('Disembunyikan')}</span>
                <Switch id={`menu-${m.key}`} on={on} label={t(m.label)} onChange={(v) => set(m.key, v)} />
              </div>
              {m.children?.map((c) => {
                const cOn = isOn(c.key);
                return (
                  <div key={c.key} className={`menu-row sub${on ? '' : ' muted'}`}>
                    <span className="menu-name"><Icon name="subitem" size={18} />{t(c.label)}</span>
                    <span className={`menu-state${on && cOn ? ' on' : ''}`}>{on && cOn ? t('Tampil') : t('Disembunyikan')}</span>
                    <Switch id={`menu-${c.key.replace('.', '-')}`} on={cOn} disabled={!on} label={`${t(m.label)}: ${t(c.label)}`} onChange={(v) => set(c.key, v)} />
                  </div>
                );
              })}
            </div>
          );
        })}
        {err && <div className="error-text" role="alert">{err}</div>}
        <div className="form-foot">
          {dirty && <span className="t-sub">{t('Ada perubahan yang belum disimpan.')}</span>}
          <button type="button" className="btn" disabled={busy} onClick={() => setHidden([])}>{t('Tampilkan semua')}</button>
          <button type="button" className="btn primary" disabled={busy || !dirty} onClick={save}>{busy ? t('Menyimpan…') : t('Simpan')}</button>
        </div>
      </div>
    </div>
  );
}
