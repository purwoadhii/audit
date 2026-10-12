import { createContext, Fragment, useCallback, useContext, useEffect, useState } from 'react';
import en from './locales/en.json';

// Terjemahan tampilan. Teks di kode ditulis dalam bahasa Indonesia dan dibungkus dengan t(teks); teks itu sekaligus
// menjadi kunci kamus di src/locales/<bahasa>.json. Teks yang belum ada di kamus tampil dalam bahasa Indonesia.
// Isian: t('Sisa {n} hari', { n }). Bentuk jamak di terjemahan: '{n} {n:day|days}'.
// Kalimat dengan elemen di dalamnya: <T k="Masuk di {path} untuk mengatur." path={<b>/sysAdmin</b>} />.
// Teks di luar komponen (konstanta) ditandai dengan N_(teks) lalu diterjemahkan saat ditampilkan dengan t(nilai).
// Daftar kunci diperbarui dengan: node scripts/i18n-keys.mjs
export const LANGS = [
  { code: 'en', label: 'English', short: 'EN', locale: 'en-GB' },
  { code: 'id', label: 'Bahasa Indonesia', short: 'ID', locale: 'id-ID' },
  { code: 'ms', label: 'Bahasa Melayu', short: 'MS', locale: 'ms-MY' },
  { code: 'zh', label: '简体中文', short: '中文', locale: 'zh-CN' },
  { code: 'ja', label: '日本語', short: '日本語', locale: 'ja-JP' },
  { code: 'ko', label: '한국어', short: '한국어', locale: 'ko-KR' },
];
export const DEFAULT_LANG = 'en';
const LOADERS = {
  ms: () => import('./locales/ms.json'),
  zh: () => import('./locales/zh.json'),
  ja: () => import('./locales/ja.json'),
  ko: () => import('./locales/ko.json'),
};
const STORE_KEY = 'am_lang';

let current = DEFAULT_LANG;
let dict = en;

export const N_ = (s) => s;
export const currentLang = () => current;
export const localeTag = () => (LANGS.find((l) => l.code === current) || LANGS[0]).locale;
const isLang = (code) => LANGS.some((l) => l.code === code);

function fill(text, vars) {
  if (!vars) return text;
  return text
    .replace(/\{(\w+):([^|}]*)\|([^}]*)\}/g, (_m, k, one, other) => (Number(vars[k]) === 1 ? one : other))
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
}

const lookup = (src) => (current === 'id' ? src : dict[src] || src);

export function t(src, vars) {
  if (src === null || src === undefined || src === '') return src;
  return fill(lookup(String(src)), vars);
}

// Pesan dari server: teks Indonesia dengan isian. Isian yang berupa teks (misalnya nama kolom) ikut diterjemahkan.
export function tServer(key, vars) {
  if (!vars) return t(key);
  const out = {};
  for (const [k, v] of Object.entries(vars)) out[k] = typeof v === 'string' ? lookup(v) : v;
  return fill(lookup(String(key)), out);
}

// Teks jadi dari server (misalnya hasil tes penyedia AI) yang dibuat dari pola berisi isian: cari pola yang cocok
// di kamus, lalu terjemahkan pola dan isiannya. Hanya pola dengan teks tetap yang cukup panjang supaya tidak salah cocok.
let patterns = null;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function compilePatterns() {
  patterns = Object.keys(dict).filter((k) => k.includes('{') && k.replace(/\{\w+\}/g, '').length >= 15).map((k) => {
    const names = [];
    const re = new RegExp(`^${k.split(/(\{\w+\})/).map((p) => {
      const m = /^\{(\w+)\}$/.exec(p);
      if (!m) return escapeRe(p);
      names.push(m[1]);
      return '([\\s\\S]+?)';
    }).join('')}$`);
    return { k, re, names };
  });
}
export function tText(text, depth = 0) {
  if (!text || current === 'id') return text;
  const s = String(text);
  if (dict[s]) return dict[s];
  if (depth > 2) return s;
  if (!patterns) compilePatterns();
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (!m) continue;
    const vars = Object.fromEntries(p.names.map((n, i) => [n, tText(m[i + 1], depth + 1)]));
    return fill(dict[p.k], vars);
  }
  return s;
}

// Kalimat terjemahan yang berisi elemen React, misalnya teks tebal atau tautan.
export function T({ k, ...parts }) {
  const text = lookup(k).replace(/\{(\w+):([^|}]*)\|([^}]*)\}/g, (_m, n, one, other) => (Number(parts[n]) === 1 ? one : other));
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    out.push(text.slice(last, m.index));
    out.push(m[1] in parts ? <Fragment key={out.length}>{parts[m[1]]}</Fragment> : m[0]);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

export function savedLang() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return isLang(v) ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

async function load(code) {
  if (!isLang(code)) code = DEFAULT_LANG;
  dict = code === 'id' ? {} : code === 'en' ? en : (await LOADERS[code]()).default;
  patterns = null;
  current = code;
  document.documentElement.lang = code;
  try { localStorage.setItem(STORE_KEY, code); } catch { /* penyimpanan browser tidak tersedia */ }
}

const I18nContext = createContext({ lang: DEFAULT_LANG, setLang: async () => {} });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(null);
  useEffect(() => { load(savedLang()).then(() => setLangState(current)); }, []);
  const setLang = useCallback(async (code) => {
    if (code === current) return;
    await load(code);
    setLangState(current);
  }, []);
  if (!lang) return null;
  return <I18nContext.Provider value={{ lang, setLang }}>{children}</I18nContext.Provider>;
}

export const useLang = () => useContext(I18nContext);

// Halaman digambar ulang dari awal saat bahasa berganti, supaya semua teks memakai bahasa baru.
export function LangBoundary({ children }) {
  const { lang } = useLang();
  return <Fragment key={lang}>{children}</Fragment>;
}
