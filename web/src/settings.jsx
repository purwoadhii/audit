import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

// Pengaturan dari admin: nama aplikasi, tema, teks login, dan data master.
const DEFAULTS = {
  app_name: 'Audit Management',
  app_tagline: 'Manajemen audit internal',
  theme: 'teal',
  login_title: 'Selamat datang',
  login_subtitle: 'Masukkan username dan password akun Anda.',
  login_hero_title: 'Audit lebih rapi, temuan lebih terkendali',
  login_hero_text: 'Rencanakan audit, kelola kertas kerja, catat temuan, dan pantau tindak lanjut dalam satu tempat.',
  forgot_password_text: 'Hubungi admin aplikasi untuk mengatur ulang password Anda.',
  login_background_url: '',
  app_background_url: '',
  maintenance: false,
  maintenance_message: '',
  units: [],
  audit_types: ['Keuangan', 'Operasional', 'Kepatuhan', 'Teknologi Informasi', 'Pengadaan', 'Investigasi'],
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
    document.title = settings.app_name;
  }, [settings.theme, settings.app_name]);

  return <SettingsContext.Provider value={{ settings, reload }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
