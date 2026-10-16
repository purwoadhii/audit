// Login SSO dengan OpenID Connect (authorization code + PKCE) untuk pintu pengguna.
// Penyedia: Google Workspace, Microsoft Entra ID (Azure AD / Microsoft 365), atau penyedia OIDC lain
// (Keycloak, Okta, Authentik, dan sebagainya). Akun dicocokkan dengan email; akun yang belum ada tidak dibuat
// otomatis kecuali System Admin mengaktifkannya untuk domain email tertentu.
// id_token diterima langsung dari token endpoint lewat HTTPS dengan client secret, sehingga keaslian penerbit
// dijamin oleh TLS (OIDC Core 3.1.3.7); klaim iss, aud, exp, dan nonce tetap diperiksa.
import crypto from 'node:crypto';
import { query } from './db.js';
import { badRequest, N_ } from './errors.js';
import { sealSecret, openSecret } from './secret.js';

const KEY = 'sso';
export const PROVIDERS = {
  google: { label: 'Google', issuer: 'https://accounts.google.com' },
  microsoft: { label: 'Microsoft', issuer: 'https://login.microsoftonline.com/{tenant}/v2.0' },
  oidc: { label: 'SSO', issuer: '' },
};
export const SSO_ROLES = ['auditor', 'auditee', 'manajemen'];
const DEFAULT = {
  enabled: false, provider: 'google', tenant: '', issuer: '', client_id: '', secret: '', button_label: '',
  domains: [], auto_create: false, default_role: 'auditee', password_login: true,
};

let cache = null;
export async function loadSso() {
  if (cache) return cache;
  const { rows } = await query('SELECT v FROM settings WHERE k = ?', [KEY]);
  let saved = {};
  try { saved = rows[0] ? JSON.parse(rows[0].v) : {}; } catch { /* bawaan */ }
  cache = { ...DEFAULT, ...saved };
  return cache;
}

// Penerbit wajib HTTPS, kecuali di komputer sendiri (localhost) untuk percobaan.
export const secureIssuer = (u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u);

export function issuerOf(c) {
  if (c.provider === 'microsoft') return PROVIDERS.microsoft.issuer.replace('{tenant}', c.tenant || 'organizations');
  if (c.provider === 'google') return PROVIDERS.google.issuer;
  return String(c.issuer || '').replace(/\/+$/, '');
}

// Bentuk yang aman untuk System Admin: secret tidak pernah dikirim.
export const publicSso = (c) => {
  const { secret, ...rest } = c;
  return { ...rest, has_secret: Boolean(secret && openSecret(secret, 'sso') !== null) };
};

// Yang perlu diketahui halaman login: apakah tombol SSO tampil dan apa labelnya.
export async function loginSso() {
  const c = await loadSso();
  if (!c.enabled || !c.client_id) return { enabled: false, password_login: true };
  return { enabled: true, label: c.button_label || PROVIDERS[c.provider]?.label || 'SSO', provider: c.provider, password_login: c.password_login !== false };
}

export async function saveSso(user, body) {
  const prev = await loadSso();
  const provider = Object.keys(PROVIDERS).includes(body.provider) ? body.provider : prev.provider;
  const domains = (Array.isArray(body.domains) ? body.domains : String(body.domains || '').split(/[\s,;]+/))
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  for (const d of domains) if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw badRequest('Domain email {name} tidak valid.', { name: d });
  const next = {
    enabled: Boolean(body.enabled),
    provider,
    tenant: String(body.tenant ?? prev.tenant).trim(),
    issuer: String(body.issuer ?? prev.issuer).trim(),
    client_id: String(body.client_id ?? prev.client_id).trim(),
    secret: body.client_secret ? sealSecret(String(body.client_secret), 'sso') : prev.secret,
    button_label: String(body.button_label ?? prev.button_label).trim().slice(0, 40),
    domains,
    auto_create: Boolean(body.auto_create),
    default_role: SSO_ROLES.includes(body.default_role) ? body.default_role : 'auditee',
    password_login: body.password_login !== false,
  };
  if (next.provider === 'oidc' && next.issuer && !secureIssuer(next.issuer)) throw badRequest('Alamat penerbit (issuer) harus diawali https://.');
  if (next.enabled) {
    if (!next.client_id) throw badRequest('{label} wajib diisi.', { label: 'Client ID' });
    if (!next.secret || openSecret(next.secret, 'sso') === null) throw badRequest('{label} wajib diisi.', { label: 'Client secret' });
    if (next.provider === 'oidc' && !next.issuer) throw badRequest('{label} wajib diisi.', { label: 'Issuer' });
    if (next.auto_create && !next.domains.length) throw badRequest('Isi domain email perusahaan sebelum mengaktifkan pembuatan akun otomatis.');
  }
  // Login dengan kata sandi hanya boleh dimatikan bila SSO aktif.
  if (!next.enabled) next.password_login = true;
  await query(
    'INSERT INTO settings (k, v, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP(3)',
    [KEY, JSON.stringify(next), user.id]);
  cache = null;
  discovery.clear();
  return next;
}

// Dokumen discovery penerbit (endpoint authorize dan token), disimpan sementara 1 jam.
const discovery = new Map();
export async function discover(issuer) {
  const hit = discovery.get(issuer);
  if (hit && Date.now() - hit.at < 3600000) return hit.doc;
  const res = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw badRequest('Konfigurasi SSO dari {issuer} tidak bisa dibaca (HTTP {status}).', { issuer, status: res.status });
  const doc = await res.json();
  if (!doc.authorization_endpoint || !doc.token_endpoint) throw badRequest('Konfigurasi SSO dari {issuer} tidak lengkap.', { issuer });
  discovery.set(issuer, { at: Date.now(), doc });
  return doc;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Langkah 1: alamat login di penyedia, dengan state, nonce, dan PKCE yang disimpan di cookie sementara.
export async function startLogin(redirectUri) {
  const c = await loadSso();
  if (!c.enabled) throw badRequest('Login SSO belum diaktifkan.');
  const doc = await discover(issuerOf(c));
  const flow = { state: b64url(crypto.randomBytes(18)), nonce: b64url(crypto.randomBytes(18)), verifier: b64url(crypto.randomBytes(32)), at: Date.now() };
  const challenge = b64url(crypto.createHash('sha256').update(flow.verifier).digest());
  const url = new URL(doc.authorization_endpoint);
  const params = {
    response_type: 'code', client_id: c.client_id, redirect_uri: redirectUri, scope: 'openid email profile',
    state: flow.state, nonce: flow.nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  };
  // Google: batasi pilihan akun ke domain perusahaan bila hanya satu domain.
  if (c.provider === 'google' && c.domains.length === 1) params.hd = c.domains[0];
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { url: url.toString(), flow };
}

function decodeJwt(token) {
  const [, payload] = String(token || '').split('.');
  if (!payload) throw badRequest('Jawaban SSO tidak berisi id_token.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

// Langkah 2: tukar code dengan token, periksa klaim, lalu kembalikan email dan nama dari penyedia.
export async function finishLogin({ code, state, flow, redirectUri }) {
  const c = await loadSso();
  if (!c.enabled) throw badRequest('Login SSO belum diaktifkan.');
  if (!flow || !state || flow.state !== state || Date.now() - flow.at > 10 * 60000) throw badRequest(N_('Sesi login SSO kedaluwarsa. Coba lagi.'));
  const issuer = issuerOf(c);
  const doc = await discover(issuer);
  const res = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: c.client_id,
      client_secret: openSecret(c.secret, 'sso') || '', code_verifier: flow.verifier,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id_token) throw badRequest('Penyedia SSO menolak login: {error}', { error: body.error_description || body.error || `HTTP ${res.status}` });
  const claims = decodeJwt(body.id_token);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  // Microsoft multi-tenant memakai issuer dengan id tenant; cukup cocokkan awalannya.
  const issOk = c.provider === 'microsoft' && !c.tenant ? /^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/.test(claims.iss) : claims.iss === (doc.issuer || issuer);
  if (!issOk || !aud.includes(c.client_id) || claims.nonce !== flow.nonce || (claims.exp && claims.exp * 1000 < Date.now() - 60000)) {
    throw badRequest('Token SSO tidak valid.');
  }
  const email = String(claims.email || claims.preferred_username || claims.upn || '').trim().toLowerCase();
  if (!email.includes('@')) throw badRequest('Akun SSO tidak memberikan alamat email.');
  if (claims.email_verified === false) throw badRequest('Email akun SSO belum diverifikasi penyedia.');
  const domain = email.split('@')[1];
  if (c.domains.length && !c.domains.includes(domain)) throw badRequest('Email {email} bukan domain yang diizinkan untuk login SSO.', { email });
  return { email, name: String(claims.name || email.split('@')[0]).slice(0, 120), config: c };
}
