import { api } from '../api.js';
import { fmtDateTime, fmtSize } from '../util.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';

function uptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d} hari`, h && `${h} jam`, `${m} menit`].filter(Boolean).join(' ');
}

const Flag = ({ on, yes = 'Ya', no = 'Tidak' }) => (on ? <span className="ok-text">{yes}</span> : <span className="bad-text">{no}</span>);

// Halaman pemeriksaan teknis untuk Infra Admin (developer).
export default function System() {
  const info = useLoad(() => api.get('/admin/system'), []);
  const errors = useLoad(() => api.get('/admin/errors'), []);
  if (info.loading && !info.data) return <Loading />;
  if (info.error) return <ErrorBox error={info.error} retry={info.reload} />;
  const { app, database: db, uploads, config } = info.data;
  return (
    <>
      <div className="bar"><h2>Sistem</h2><button className="btn" onClick={() => { info.reload(); errors.reload(); }}>Muat ulang</button></div>
      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="panel">
          <h3>Aplikasi</h3>
          <dl className="dl">
            <dt>Versi</dt><dd>{app.version}</dd>
            <dt>Node.js</dt><dd>{app.node} · {app.platform}</dd>
            <dt>Mode</dt><dd>{app.env}</dd>
            <dt>Berjalan sejak</dt><dd>{fmtDateTime(app.started_at)} ({uptime(app.uptime_s)})</dd>
            <dt>Memori</dt><dd>{app.memory_mb} MB</dd>
          </dl>
        </div>
        <div className="panel">
          <h3>Database</h3>
          <dl className="dl">
            <dt>Server</dt><dd>{db.version}</dd>
            <dt>Nama database</dt><dd className="code">{db.name}</dd>
            <dt>Waktu server</dt><dd>{fmtDateTime(db.time)}</dd>
            <dt>Migrasi</dt><dd>{db.migrations.length} diterapkan, terakhir <span className="code">{db.migrations.at(-1)?.name}</span></dd>
          </dl>
        </div>
        <div className="panel">
          <h3>Penyimpanan bukti</h3>
          <dl className="dl">
            <dt>Folder</dt><dd className="code">{uploads.dir}</dd>
            <dt>Isi</dt><dd>{uploads.files} file, {fmtSize(uploads.bytes)}</dd>
            <dt>Batas per file</dt><dd>{uploads.max_mb} MB</dd>
          </dl>
        </div>
        <div className="panel">
          <h3>Konfigurasi</h3>
          <dl className="dl">
            <dt>JWT_SECRET diisi</dt><dd><Flag on={config.jwt_secret_set} no="Belum, wajib di server" /></dd>
            <dt>Cookie HTTPS</dt><dd><Flag on={config.cookie_secure} no="Tidak (aktifkan bila memakai HTTPS)" /></dd>
            <dt>Email pengingat</dt><dd><Flag on={config.smtp} yes={`Aktif, jam ${config.reminder_hour}.00`} no="Nonaktif" /></dd>
            <dt>Alamat aplikasi</dt><dd className="code">{config.app_url}</dd>
          </dl>
        </div>
      </div>
      <div className="grid2">
        <div className="tablebox">
          <table>
            <thead><tr><th>Tabel</th><th>Baris (perkiraan)</th><th>Ukuran</th></tr></thead>
            <tbody>{db.tables.map((t) => <tr key={t.name}><td className="code">{t.name}</td><td className="num">{t.approx_rows ?? '—'}</td><td className="num">{fmtSize(Number(t.bytes) || 0)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="panel">
          <h3>Kesalahan server terakhir</h3>
          {!errors.data?.length ? <div className="t-sub">Tidak ada kesalahan sejak aplikasi dijalankan.</div> : (
            <div className="log">
              {errors.data.map((e, i) => (
                <div className="log-item" key={i}>
                  <div className="when">{fmtDateTime(e.at)} · {e.method} <span className="code">{e.url}</span></div>
                  <div className="bad-text">{e.message}</div>
                  {e.stack && <pre className="err">{e.stack}</pre>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
