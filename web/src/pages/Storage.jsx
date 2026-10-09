import { Fragment, useState } from 'react';
import { api } from '../api.js';
import { fmtDateTime, fmtSize } from '../util.js';
import { ErrorBox, Loading, Req, useLoad, useToast } from '../components/ui.jsx';

// Contoh endpoint untuk penyedia yang umum dipakai.
const PRESETS = [
  { label: 'AWS S3', endpoint: '', region: 'ap-southeast-3', path_style: false },
  { label: 'MinIO (server sendiri)', endpoint: 'http://192.168.1.10:9000', region: 'us-east-1', path_style: true },
  { label: 'Google Cloud Storage', endpoint: 'https://storage.googleapis.com', region: 'auto', path_style: true },
  { label: 'Cloudflare R2', endpoint: 'https://ACCOUNT_ID.r2.cloudflarestorage.com', region: 'auto', path_style: true },
];

// System Admin: memilih tempat menyimpan file bukti dan kertas kerja.
export function StorageSettings() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get('/admin/storage'), []);
  const [f, setF] = useState(null);
  const [secret, setSecret] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const form = f || { driver: data.driver, local_dir: data.local_dir, s3: data.s3 };
  const setS3 = (k) => (e) => setF({ ...form, s3: { ...form.s3, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } });
  const body = () => ({ ...form, ...(secret ? { secret_key: secret } : {}) });

  async function run(kind) {
    setBusy(true);
    setMsg(null);
    try {
      if (kind === 'test') {
        const r = await api.post('/admin/storage/test', body());
        setMsg({ ok: r.ok, text: r.ok ? `Koneksi berhasil (${r.ms} ms). ${r.message}` : r.message });
      } else {
        await api.put('/admin/storage', body());
        setSecret('');
        setF(null);
        toast('Pengaturan penyimpanan disimpan');
        reload();
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const s3 = form.driver === 's3';
  return (
    <form className="panel form" onSubmit={(e) => { e.preventDefault(); run('save'); }} aria-label="Penyimpanan file">
      <h3 className="full" style={{ margin: 0 }}>Penyimpanan file bukti</h3>
      <p className="form-note full">
        File bukti dan kertas kerja yang diunggah pengguna disimpan di tempat yang dipilih di sini. Mengganti tempat penyimpanan
        hanya berlaku untuk unggahan berikutnya; file lama tetap bisa dibuka dari tempat asalnya.
      </p>
      <div className="full swatches" role="radiogroup" aria-label="Tempat penyimpanan">
        <button type="button" className="swatch" aria-pressed={!s3} onClick={() => setF({ ...form, driver: 'local' })}>Server aplikasi (lokal / on-premise)</button>
        <button type="button" className="swatch" aria-pressed={s3} onClick={() => setF({ ...form, driver: 's3' })}>Object storage S3 (cloud atau server lain)</button>
      </div>
      {!s3 && (
        <label className="full">Folder penyimpanan
          <input id="st-dir" value={form.local_dir} onChange={(e) => setF({ ...form, local_dir: e.target.value })} placeholder={data.default_dir} spellCheck={false} />
          <span className="hint">
            Alamat lengkap folder di komputer server, misalnya <span className="code">D:/AuditManagement/files</span> atau folder NAS yang
            sudah di-mapping. Kosongkan untuk memakai folder bawaan ({data.default_dir}). Folder dibuat otomatis bila belum ada.
            Aplikasi hanya menampilkan file yang diunggah lewat aplikasi, bukan file lain di folder itu.
          </span>
        </label>
      )}
      {s3 && (
        <>
          <div className="full">
            <span className="lbl">Isi cepat untuk</span>
            <div className="swatches">
              {PRESETS.map((p) => (
                <button type="button" key={p.label} className="swatch" onClick={() => setF({ ...form, s3: { ...form.s3, endpoint: p.endpoint, region: p.region, path_style: p.path_style } })}>{p.label}</button>
              ))}
            </div>
          </div>
          <label>Endpoint<input id="st-endpoint" value={form.s3.endpoint} onChange={setS3('endpoint')} placeholder="Kosongkan untuk AWS S3" /><span className="hint">Alamat server S3. MinIO di kantor misalnya http://192.168.1.10:9000.</span></label>
          <label>Region<input id="st-region" value={form.s3.region} onChange={setS3('region')} placeholder="us-east-1" /></label>
          <label><span>Nama bucket <Req /></span><input id="st-bucket" required value={form.s3.bucket} onChange={setS3('bucket')} placeholder="bukti-audit" /></label>
          <label>Folder awalan<input id="st-prefix" value={form.s3.prefix} onChange={setS3('prefix')} placeholder="audit/" /><span className="hint">File disimpan di dalam folder ini di bucket.</span></label>
          <label><span>Access key <Req /></span><input id="st-access" required autoComplete="off" value={form.s3.access_key} onChange={setS3('access_key')} /></label>
          <label><span>Secret key {!data.secret_set && <Req />}</span>
            <input id="st-secret" type="password" autoComplete="new-password" required={!data.secret_set} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={data.secret_set ? 'Tersimpan. Isi hanya untuk mengganti.' : ''} />
            {data.secret_unreadable && <span className="hint bad-text">Secret lama tidak bisa dibaca karena JWT_SECRET berubah. Isi ulang.</span>}
          </label>
          <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input id="st-path" type="checkbox" style={{ width: 'auto' }} checked={form.s3.path_style} onChange={setS3('path_style')} />
            Alamat bergaya path (centang untuk MinIO dan kebanyakan penyedia selain AWS)
          </label>
        </>
      )}
      {msg && <div className={`full ${msg.ok ? 'ok-text' : 'error-text'}`} role="status">{msg.text}</div>}
      <div className="form-foot full">
        <button type="button" className="btn" disabled={busy} onClick={() => run('test')}>Tes koneksi</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Memeriksa…' : 'Simpan'}</button>
      </div>
    </form>
  );
}

// Infra Admin: memantau kondisi penyimpanan.
export function StorageStatus() {
  const [check, setCheck] = useState(0);
  const { data, error, loading, reload } = useLoad(() => api.get(`/admin/storage/status${check ? '?check=1' : ''}`), [check]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const h = data.health;
  return (
    <div className="grid2">
      <div className="panel">
        <h3>Penyimpanan aktif</h3>
        <dl className="dl">
          <dt>Jenis</dt><dd>{data.driver === 's3' ? 'Object storage S3' : 'Server aplikasi (lokal)'}</dd>
          <dt>Lokasi</dt><dd className="code">{data.target}</dd>
          <dt>Status</dt><dd>{h.ok === null ? '—' : h.ok ? <span className="ok-text">Normal</span> : <span className="bad-text">Bermasalah</span>} <span className="t-sub">{h.message}</span></dd>
          <dt>Diperiksa</dt><dd>{h.last_check ? fmtDateTime(h.last_check) : '—'}</dd>
          <dt>Batas per file</dt><dd>{data.max_upload_mb} MB</dd>
          {data.secret_unreadable && <><dt>Peringatan</dt><dd className="bad-text">Secret S3 tidak terbaca karena JWT_SECRET berubah.</dd></>}
        </dl>
        <div className="form-foot" style={{ marginTop: 12 }}><button className="btn" onClick={() => setCheck((c) => c + 1)}>Periksa sekarang</button></div>
      </div>
      <div className="panel">
        <h3>Pemakaian</h3>
        <dl className="dl">
          {data.usage.length ? data.usage.map((u) => (
            <Fragment key={`${u.storage}:${u.dir}`}><dt>{u.storage === 's3' ? 'Di S3' : <>Di server lokal<div className="t-sub code">{u.dir}</div></>}</dt><dd>{u.files} file, {fmtSize(u.bytes)}</dd></Fragment>
          )) : <><dt>File bukti</dt><dd>Belum ada</dd></>}
        </dl>
        <h3 style={{ marginTop: 16 }}>Kesalahan terakhir</h3>
        {h.last_error ? <div><div className="t-sub">{fmtDateTime(h.last_error.at)}</div><div className="bad-text">{h.last_error.message}</div></div> : <div className="t-sub">Tidak ada.</div>}
      </div>
    </div>
  );
}
