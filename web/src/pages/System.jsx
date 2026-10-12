import { api } from '../api.js';
import { fmtDateTime, fmtSize } from '../util.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { T, t } from '../i18n.jsx';

function uptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && t('{n} hari', { n: d }), h && t('{n} jam', { n: h }), t('{n} menit', { n: m })].filter(Boolean).join(' ');
}

const Flag = ({ on, yes = t('Ya'), no = t('Tidak') }) => (on ? <span className="ok-text">{yes}</span> : <span className="bad-text">{no}</span>);

// Halaman pemeriksaan teknis untuk Infra Admin (developer).
export default function System() {
  const info = useLoad(() => api.get('/admin/system'), []);
  const errors = useLoad(() => api.get('/admin/errors'), []);
  if (info.loading && !info.data) return <Loading />;
  if (info.error) return <ErrorBox error={info.error} retry={info.reload} />;
  const { app, database: db, uploads, config } = info.data;
  return (
    <>
      <div className="bar"><h2>{t('Sistem')}</h2><button className="btn" onClick={() => { info.reload(); errors.reload(); }}>{t('Muat ulang')}</button></div>
      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="panel">
          <h3>{t('Aplikasi')}</h3>
          <dl className="dl">
            <dt>{t('Versi')}</dt><dd>{app.version}</dd>
            <dt>Node.js</dt><dd>{app.node} · {app.platform}</dd>
            <dt>{t('Mode')}</dt><dd>{app.env}</dd>
            <dt>{t('Berjalan sejak')}</dt><dd>{fmtDateTime(app.started_at)} ({uptime(app.uptime_s)})</dd>
            <dt>{t('Memori')}</dt><dd>{app.memory_mb} MB</dd>
          </dl>
        </div>
        <div className="panel">
          <h3>{t('Database')}</h3>
          <dl className="dl">
            <dt>{t('Server')}</dt><dd>{db.version}</dd>
            <dt>{t('Nama database')}</dt><dd className="code">{db.name}</dd>
            <dt>{t('Waktu server')}</dt><dd>{fmtDateTime(db.time)}</dd>
            <dt>{t('Migrasi')}</dt><dd><T k="{n} diterapkan, terakhir {name}" n={db.migrations.length} name={<span className="code">{db.migrations.at(-1)?.name}</span>} /></dd>
          </dl>
        </div>
        <div className="panel">
          <h3>{t('Penyimpanan bukti')}</h3>
          <dl className="dl">
            <dt>{t('Folder')}</dt><dd className="code">{uploads.dir}</dd>
            <dt>{t('Isi')}</dt><dd>{t('{n} file, {size}', { n: uploads.files, size: fmtSize(uploads.bytes) })}</dd>
            <dt>{t('Batas per file')}</dt><dd>{uploads.max_mb} MB</dd>
          </dl>
        </div>
        <div className="panel">
          <h3>{t('Konfigurasi')}</h3>
          <dl className="dl">
            <dt>{t('JWT_SECRET diisi')}</dt><dd><Flag on={config.jwt_secret_set} no={t('Belum, wajib di server')} /></dd>
            <dt>{t('Cookie HTTPS')}</dt><dd><Flag on={config.cookie_secure} no={t('Tidak (aktifkan bila memakai HTTPS)')} /></dd>
            <dt>{t('Email pengingat')}</dt><dd><Flag on={config.smtp} yes={t('Aktif, jam {hour}.00', { hour: config.reminder_hour })} no={t('Nonaktif')} /></dd>
            <dt>{t('Alamat aplikasi')}</dt><dd className="code">{config.app_url}</dd>
          </dl>
        </div>
      </div>
      <div className="grid2">
        <div className="tablebox">
          <table>
            <thead><tr><th>{t('Tabel')}</th><th>{t('Baris (perkiraan)')}</th><th>{t('Ukuran')}</th></tr></thead>
            <tbody>{db.tables.map((tb) => <tr key={tb.name}><td className="code">{tb.name}</td><td className="num">{tb.approx_rows ?? '—'}</td><td className="num">{fmtSize(Number(tb.bytes) || 0)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="panel">
          <h3>{t('Kesalahan server terakhir')}</h3>
          {!errors.data?.length ? <div className="t-sub">{t('Tidak ada kesalahan sejak aplikasi dijalankan.')}</div> : (
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
