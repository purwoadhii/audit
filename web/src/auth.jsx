import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = sedang memeriksa sesi
  const [notice, setNotice] = useState(''); // pesan untuk halaman login, misalnya lisensi habis

  useEffect(() => {
    setUnauthorizedHandler((msg) => { setNotice(msg || ''); setUser(null); });
    api.get('/auth/me').then(setUser).catch((err) => { if (err.status === 403) setNotice(err.message); setUser(null); });
  }, []);

  const login = useCallback(async (username, password, remember = false) => {
    const u = await api.post('/auth/login', { username, password, remember });
    setNotice('');
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, notice }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
