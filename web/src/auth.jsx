import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import { currentLang, useLang } from './i18n.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = sedang memeriksa sesi
  const [notice, setNotice] = useState(''); // pesan untuk halaman login, misalnya lisensi habis
  const { setLang } = useLang();
  const pickedBeforeLogin = useRef(false); // bahasa dipilih di halaman login

  // Bahasa yang tersimpan di akun dipakai setelah masuk.
  const signedIn = useCallback((u) => {
    setUser(u);
    if (u?.language && u.language !== currentLang()) setLang(u.language);
  }, [setLang]);

  useEffect(() => {
    setUnauthorizedHandler((msg) => { setNotice(msg || ''); setUser(null); });
    api.get('/auth/me').then(signedIn).catch((err) => { if (err.status === 403) setNotice(err.message); setUser(null); });
  }, [signedIn]);

  const login = useCallback(async (username, password, remember = false) => {
    const u = await api.post('/auth/login', { username, password, remember });
    setNotice('');
    if (pickedBeforeLogin.current && u.language !== currentLang()) {
      // Bahasa yang dipilih di halaman login disimpan ke akun.
      u.language = currentLang();
      api.put('/auth/language', { language: u.language }).catch(() => {});
    }
    pickedBeforeLogin.current = false;
    signedIn(u);
  }, [signedIn]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    // Data yang disimpan untuk mode offline ikut dihapus.
    navigator.serviceWorker?.controller?.postMessage({ type: 'clear-data' });
    setUser(null);
  }, []);

  // Ganti bahasa: langsung dipakai, dan disimpan ke akun bila sudah masuk.
  const changeLanguage = useCallback(async (code) => {
    if (user) {
      await api.put('/auth/language', { language: code }).catch(() => {});
      setUser({ ...user, language: code });
    } else {
      pickedBeforeLogin.current = true;
    }
    await setLang(code);
  }, [user, setLang]);

  return <AuthContext.Provider value={{ user, login, logout, notice, changeLanguage }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
