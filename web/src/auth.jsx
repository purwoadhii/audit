import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = sedang memeriksa sesi

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.get('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  const login = useCallback(async (username, password, remember = false) => {
    const u = await api.post('/auth/login', { username, password, remember });
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  // Akun admin yang punya peran kerja bisa berpindah ke mode kerja dan kembali ke mode admin.
  const switchMode = useCallback(async (mode) => {
    setUser(await api.post('/auth/mode', { mode }));
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, switchMode }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
