import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLES, fmtDateTime } from '../util.js';
import { ErrorBox, Loading, useLoad, useToast } from '../components/ui.jsx';

const WORK_ROLES = ['auditor', 'auditee', 'manajemen'];

// System Admin: penyedia AI, API key, urutan cadangan, dan siapa yang boleh memakai.
export function AiSettings() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get('/admin/ai'), []);
  const [f, setF] = useState(null);
  const [keys, setKeys] = useState({});
  const [tests, setTests] = useState({});
  const [lists, setLists] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const form = f || structuredClone({ enabled: data.enabled, roles: data.roles, order: data.order, providers: data.providers });
  // Pesan hasil tes dan daftar model dihapus saat isian kartu berubah, supaya tidak ada pesan lama yang menyesatkan.
  const clearMsgs = (id) => {
    setTests((t) => ({ ...t, [id]: undefined }));
    setLists((l) => ({ ...l, [id]: l[id]?.ok ? l[id] : undefined }));
  };
  const setP = (id, k, v) => {
    if (k !== 'model') clearMsgs(id);
    setF({ ...form, providers: { ...form.providers, [id]: { ...form.providers[id], [k]: v } } });
  };
  const move = (i, d) => {
    const order = [...form.order];
    [order[i], order[i + d]] = [order[i + d], order[i]];
    setF({ ...form, order });
  };

  function body() {
    return {
      enabled: form.enabled,
      roles: form.roles,
      order: form.order,
      providers: Object.fromEntries(form.order.map((id) => {
        const p = form.providers[id];
        return [id, { enabled: p.enabled, model: p.model, base_url: p.base_url, ...(keys[id] ? { key: keys[id] } : {}), ...(p.remove_key ? { remove_key: true } : {}) }];
      })),
    };
  }

  async function save(e) {
    e?.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.put('/admin/ai', body());
      setKeys({});
      setF(null);
      toast('Pengaturan Asisten AI disimpan');
      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Tes dan daftar model memakai pengaturan yang sudah disimpan, jadi simpan dulu bila ada perubahan.
  async function saveFirst() {
    if (f || Object.keys(keys).length) {
      await api.put('/admin/ai', body());
      setKeys({});
      setF(null);
    }
  }

  async function test(id) {
    setTests({ ...tests, [id]: { busy: true } });
    setLists((l) => ({ ...l, [id]: l[id]?.ok ? l[id] : undefined }));
    try {
      await saveFirst();
      const r = await api.post('/admin/ai/test', { provider: id });
      setTests((t) => ({ ...t, [id]: r }));
    } catch (err) {
      setTests((t) => ({ ...t, [id]: { ok: false, message: err.message } }));
    }
    reload();
  }

  async function models(id) {
    setLists({ ...lists, [id]: { busy: true } });
    setTests((t) => ({ ...t, [id]: undefined }));
    try {
      await saveFirst();
      const r = await api.post('/admin/ai/models', { provider: id });
      setLists((l) => ({ ...l, [id]: r }));
    } catch (err) {
      setLists((l) => ({ ...l, [id]: { ok: false, message: err.message } }));
    }
    reload();
  }

  const ready = form.order.filter((id) => form.providers[id].enabled && (form.providers[id].key_set || keys[id]));
  return (
    <>
      <form className="panel form" onSubmit={save} aria-label="Asisten AI">
        <h3 className="full" style={{ margin: 0 }}>Asisten AI</h3>
        <p className="form-note full">
          Pengguna bisa meminta AI mencari audit, temuan, dan isi file (termasuk hasil OCR). AI hanya melihat data yang boleh dilihat
          pengguna itu. Penyedia dipakai berurutan: bila satu kena batas pemakaian gratis atau error, permintaan otomatis pindah ke
          penyedia berikutnya. Pertanyaan dan data yang ditemukan dikirim ke penyedia AI yang dipakai.
        </p>
        <label className="full check-row"><input id="ai-enabled" type="checkbox" checked={form.enabled} onChange={(e) => setF({ ...form, enabled: e.target.checked })} />Aktifkan Asisten AI</label>
        <div className="full">
          <span className="lbl">Boleh dipakai oleh</span>
          <div className="swatches">
            {WORK_ROLES.map((r) => (
              <label key={r} className="swatch check-row">
                <input type="checkbox" checked={form.roles.includes(r)} onChange={(e) => setF({ ...form, roles: e.target.checked ? [...form.roles, r] : form.roles.filter((x) => x !== r) })} />{ROLES[r]}
              </label>
            ))}
          </div>
        </div>
        {form.enabled && !ready.length && <div className="full error-text">Isi API key minimal satu penyedia supaya Asisten AI bisa dipakai.</div>}
      </form>

      <div className="ai-providers">
        {form.order.map((id, i) => {
          const p = form.providers[id];
          const t = tests[id];
          const l = lists[id];
          return (
            <section key={id} className="panel form ai-provider" aria-label={p.label}>
              <div className="full ai-head">
                <span className="ai-rank">{i + 1}</span>
                <div className="ai-name"><b>{p.label}</b><span className="t-sub">{p.key_set ? `API key tersimpan ${p.key_hint}` : 'API key belum diisi'}</span></div>
                <label className="check-row"><input type="checkbox" checked={p.enabled} onChange={(e) => setP(id, 'enabled', e.target.checked)} />Dipakai</label>
                <div className="ai-move">
                  <button type="button" className="btn small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Naikkan ${p.label}`}>↑</button>
                  <button type="button" className="btn small" disabled={i === form.order.length - 1} onClick={() => move(i, 1)} aria-label={`Turunkan ${p.label}`}>↓</button>
                </div>
              </div>
              <label>API key
                <input id={`ai-key-${id}`} type="password" autoComplete="new-password" value={keys[id] || ''} onChange={(e) => { clearMsgs(id); setKeys({ ...keys, [id]: e.target.value }); }} placeholder={p.key_set ? 'Tersimpan. Isi hanya untuk mengganti.' : 'Tempel API key di sini'} />
                <span className="hint">Buat API key di <a href={p.key_url} target="_blank" rel="noreferrer">{p.key_url.replace('https://', '')}</a>.</span>
                {p.key_unreadable && <span className="hint bad-text">API key lama tidak bisa dibaca karena JWT_SECRET berubah. Isi ulang.</span>}
              </label>
              <label>Model
                <input id={`ai-model-${id}`} list={`ai-models-${id}`} value={p.model} onChange={(e) => setP(id, 'model', e.target.value)} placeholder={p.default_model} />
                <datalist id={`ai-models-${id}`}>{(l?.models || []).map((m) => <option key={m.id} value={m.id}>{m.free ? 'gratis' : ''}</option>)}</datalist>
                <span className="hint">
                  {l?.busy ? 'Mengambil daftar model…'
                    : l?.ok ? <>{l.models.length} model tersedia, pilih dari kolom ini.{l.recommended && <> Disarankan: <button type="button" className="linkbtn" onClick={() => setP(id, 'model', l.recommended)}>{l.recommended}</button></>}</>
                      : l?.message ? <span className="bad-text">{l.message}</span>
                        : 'Bila model sudah tidak tersedia, aplikasi otomatis memilih model pengganti.'}
                </span>
              </label>
              <details className="full">
                <summary className="t-sub">Lanjutan</summary>
                <label style={{ marginTop: 8 }}>Alamat API
                  <input id={`ai-url-${id}`} value={p.base_url} onChange={(e) => setP(id, 'base_url', e.target.value)} placeholder={p.default_base_url} />
                </label>
                {p.key_set && <label className="check-row" style={{ marginTop: 8 }}><input type="checkbox" checked={Boolean(p.remove_key)} onChange={(e) => setP(id, 'remove_key', e.target.checked)} />Hapus API key yang tersimpan</label>}
              </details>
              <div className="full form-foot" style={{ justifyContent: 'space-between' }}>
                <span className={t?.ok ? 'ok-text' : 'error-text'} role="status">{t?.busy ? 'Menguji…' : t?.message || ''}</span>
                <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                  <button type="button" className="btn" disabled={l?.busy || (!p.key_set && !keys[id])} onClick={() => models(id)}>Daftar model</button>
                  <button type="button" className="btn" disabled={t?.busy || (!p.key_set && !keys[id])} onClick={() => test(id)}>Tes</button>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <OcrPanel />
      <div className="panel form" style={{ marginTop: 12 }}>
        {msg && <div className="full error-text" role="alert">{msg}</div>}
        <div className="form-foot full"><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan pengaturan AI'}</button></div>
      </div>
    </>
  );
}

function OcrPanel() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function reprocess() {
    setBusy(true);
    try {
      const r = await api.post('/admin/ocr/reprocess', {});
      toast(r.queued ? `${r.queued} file akan dibaca ulang` : 'Tidak ada file yang perlu dibaca ulang');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <h3>Pembacaan dokumen dan OCR</h3>
      <p className="form-note">
        Teks PDF, Word, Excel, dan PowerPoint dibaca otomatis saat diunggah. Gambar dan PDF hasil scan dibaca dengan OCR
        (bahasa Indonesia dan Inggris) bila OCR aktif di <Link to="/sysAdmin/pengaturan">Pengaturan</Link>. File lama dibaca
        saat aplikasi dijalankan. Format lama (.doc, .xls, .ppt) dan ZIP tidak dibaca.
      </p>
      <button className="btn" disabled={busy} onClick={reprocess}>Baca ulang file yang belum terbaca</button>
    </div>
  );
}

const STATUS_TEXT = { done: 'Terbaca', ocr: 'Terbaca dengan OCR', pending: 'Menunggu dibaca', none: 'Format tidak dibaca', failed: 'Gagal dibaca' };

// Infra Admin: kondisi tiap penyedia dan antrian pembacaan dokumen.
export function AiStatus() {
  const { data, error, loading, reload } = useLoad(() => api.get('/admin/ai/status'), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const ex = data.extraction;
  const cooling = (p) => p.cooldown_until && new Date(p.cooldown_until) > new Date();
  return (
    <>
      <div className="bar"><h2>Asisten AI {data.enabled ? <span className="pill s-Selesai">Aktif</span> : <span className="pill">Nonaktif</span>}</h2><button className="btn" onClick={reload}>Muat ulang</button></div>
      <div className="tablebox">
        <table>
          <thead><tr><th>Urutan</th><th>Penyedia</th><th>Status</th><th>Hari ini</th><th>Token hari ini</th><th>Kesalahan terakhir</th></tr></thead>
          <tbody>
            {data.providers.map((p, i) => (
              <tr key={p.id}>
                <td className="num">{i + 1}</td>
                <td><div className="t-title">{p.label}</div><div className="t-sub code">{p.model}</div></td>
                <td>{!p.enabled ? <span className="pill">Tidak dipakai</span> : !p.key_set ? <span className="pill">Belum ada key</span>
                  : cooling(p) ? <span className="pill s-Dalam-proses">Istirahat sampai {fmtDateTime(p.cooldown_until).split(', ')[1]}</span>
                    : <span className="pill s-Selesai">Siap</span>}</td>
                <td className="num">{p.today.ok} berhasil{p.today.failed ? `, ${p.today.failed} gagal` : ''}{p.today.limited ? ` (${p.today.limited} kena batas)` : ''}</td>
                <td className="num">{(p.today.tokens_in + p.today.tokens_out).toLocaleString('id-ID')}</td>
                <td>{p.model_changed && <div className="t-sub">Model diganti otomatis {fmtDateTime(p.model_changed.at)}: {p.model_changed.from} → {p.model_changed.to}</div>}{p.last_error ? <><div className="t-sub">{fmtDateTime(p.last_error.at)}{p.last_error.status ? ` · ${p.last_error.status}` : ''}</div><div className="bad-text">{p.last_error.message}</div></> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Pembacaan dokumen dan OCR</h3>
        <dl className="dl">
          {Object.entries(STATUS_TEXT).map(([k, label]) => <Fragment key={k}><dt>{label}</dt><dd>{ex.files[k] || 0} file</dd></Fragment>)}
          <dt>Antrian</dt><dd>{ex.current ? 'Sedang membaca, ' : ''}{ex.queued} menunggu</dd>
          <dt>Kesalahan terakhir</dt><dd>{ex.last_error ? <><span className="t-sub">{fmtDateTime(ex.last_error.at)} · {ex.last_error.file}</span><div className="bad-text">{ex.last_error.message}</div></> : 'Tidak ada'}</dd>
        </dl>
      </div>
    </>
  );
}

// Ubah [teks](/alamat) dari jawaban AI menjadi tautan di dalam aplikasi. Tautan lain ditampilkan sebagai teks.
function Rich({ text }) {
  return text.split('\n').map((line, i) => {
    const parts = [];
    const re = /\[([^\]]+)\]\((\/[^)\s]*)\)|\*\*([^*]+)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      if (m[3]) parts.push(<b key={m.index}>{m[3]}</b>);
      else if (m[2].startsWith('/api/')) parts.push(<a key={m.index} href={m[2]} target="_blank" rel="noreferrer">{m[1]}</a>);
      else parts.push(<Link key={m.index} to={m[2]}>{m[1]}</Link>);
      last = re.lastIndex;
    }
    parts.push(line.slice(last));
    return <p key={i}>{parts}</p>;
  });
}

const REASON = {
  disabled: 'Asisten AI belum diaktifkan. Admin perlu mencentang "Aktifkan Asisten AI" di System Admin → Asisten AI, lalu menyimpan.',
  no_key: 'Belum ada penyedia AI dengan API key. Admin perlu mengisi API key di System Admin → Asisten AI.',
  role: 'Asisten AI belum dibuka untuk peran Anda. Admin bisa mencentang peran ini di System Admin → Asisten AI.',
  error: 'Status Asisten AI tidak bisa diperiksa. Muat ulang halaman.',
};

export function AiUnavailable({ reason }) {
  return (
    <div className="ai-chat">
      <div className="bar"><h2>Asisten AI</h2></div>
      <div className="panel"><p style={{ margin: 0 }}>{REASON[reason] || REASON.error}</p>{reason !== 'error' && <p className="t-sub" style={{ margin: '8px 0 0' }}>Setelah admin mengubahnya, muat ulang halaman ini.</p>}</div>
    </div>
  );
}

const PROVIDER_LABEL = { gemini: 'Gemini', groq: 'Groq', together: 'Together AI', huggingface: 'Hugging Face', cohere: 'Cohere' };
const EXAMPLES = ['Temuan risiko tinggi yang masih terbuka', 'Cari file kwitansi atau invoice', 'Tindak lanjut yang lewat jatuh tempo', 'Ringkas audit yang sedang berjalan'];

// Pengguna: percakapan dengan Asisten AI. Riwayat hanya disimpan di halaman ini.
export function AiChat() {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef();
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  async function send(q) {
    const content = (q ?? text).trim();
    if (!content || busy) return;
    const next = [...msgs, { role: 'user', content }];
    setMsgs(next);
    setText('');
    setBusy(true);
    try {
      const r = await api.post('/ai/chat', { messages: next.filter((m) => !m.error).map(({ role, content: c }) => ({ role, content: c })) });
      setMsgs([...next, { role: 'assistant', content: r.reply, provider: r.provider, fallbacks: r.fallbacks }]);
    } catch (err) {
      setMsgs([...next, { role: 'assistant', content: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-chat">
      <div className="bar"><h2>Asisten AI</h2>{msgs.length > 0 && <button className="btn" onClick={() => setMsgs([])}>Percakapan baru</button>}</div>
      <div className="panel ai-log" aria-live="polite">
        {!msgs.length && (
          <div className="ai-empty">
            <p>Halo {user.name.split(' ')[0]}, saya bisa mencari audit, temuan, tindak lanjut, dan isi file bukti, termasuk dokumen hasil scan. Coba tanyakan:</p>
            <div className="swatches">{EXAMPLES.map((x) => <button key={x} type="button" className="swatch" onClick={() => send(x)}>{x}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}${m.error ? ' error' : ''}`}>
            <div className="ai-bubble">{m.role === 'assistant' ? <Rich text={m.content} /> : m.content}</div>
            {m.provider && <div className="t-sub ai-meta">Dijawab oleh {PROVIDER_LABEL[m.provider] || m.provider}{m.fallbacks?.length ? ` (${m.fallbacks.map((x) => PROVIDER_LABEL[x.provider]).join(', ')} sedang tidak bisa dipakai)` : ''}</div>}
          </div>
        ))}
        {busy && <div className="ai-msg assistant"><div className="ai-bubble t-sub">Mencari…</div></div>}
        <div ref={end} />
      </div>
      <form className="ai-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea id="ai-q" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis pertanyaan, misalnya: cari temuan pengadaan tahun ini"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn primary" disabled={busy || !text.trim()}>Kirim</button>
      </form>
      <p className="t-sub" style={{ marginTop: 6 }}>Jawaban AI bisa keliru. Periksa kembali lewat tautan ke audit, temuan, atau file.</p>
    </div>
  );
}
