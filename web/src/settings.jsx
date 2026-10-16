import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { N_, t } from './i18n.jsx';

// Pengaturan dari admin: nama aplikasi, tema, teks login, dan data master.
const DEFAULTS = {
  app_name: N_('Audit Management'),
  app_tagline: N_('Manajemen audit internal'),
  theme: 'teal',
  login_title: N_('Selamat datang'),
  login_subtitle: N_('Masukkan username dan password akun Anda.'),
  login_hero_title: N_('Audit lebih rapi, temuan lebih terkendali'),
  login_hero_text: N_('Rencanakan audit, kelola kertas kerja, catat temuan, dan pantau tindak lanjut dalam satu tempat.'),
  forgot_password_text: N_('Hubungi admin aplikasi untuk mengatur ulang password Anda.'),
  login_background_url: '',
  app_background_url: '',
  version: '',
  maintenance: false,
  maintenance_message: '',
  units: [],
  unit_scope: false,
  audit_types: ['Keuangan', 'Operasional', 'Kepatuhan', 'Teknologi Informasi', 'Pengadaan', 'Investigasi'],
  finding_categories: [],
  root_causes: [],
  approval_required: true,
  review_required: true,
  universe_kinds: ['Proses bisnis', 'Sistem informasi', 'Vendor', 'Lokasi', 'Unit organisasi'],
  auditor_hours: 1200,
};

const SettingsContext = createContext({ settings: DEFAULTS, reload: () => {} });

export function SettingsProvider({ signedIn, children }) {
  const [settings, setSettings] = useState(DEFAULTS);

  const reload = useCallback(async () => {
    try {
      const pub = await api.get('/auth/settings');
      const priv = signedIn ? (await api.get('/settings')).values : {};
      setSettings({ ...DEFAULTS, ...pub, ...priv });
    } catch { /* tetap pakai nilai terakhir */ }
  }, [signedIn]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.title = t(settings.app_name);
  }, [settings.theme, settings.app_name]);

  return <SettingsContext.Provider value={{ settings, reload }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
