import { api } from '../api.js';
import { fmtDate } from '../util.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';

// Nomor versi aplikasi dan riwayat perubahannya (dari CHANGELOG.md).
export default function Version() {
  const { data, error, loading, reload } = useLoad(() => api.get('/admin/version'), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <div className="stack">
      <section className="panel version-hero">
        <div>
          <div className="t-sub">Versi terpasang</div>
          <div className="version-no">v{data.version}</div>
        </div>
        <p className="t-sub">Nomor versi MAYOR.MINOR.PERBAIKAN. Versi minor naik saat ada fitur baru, versi perbaikan naik saat ada perbaikan tanpa fitur baru.</p>
      </section>
      <section className="panel">
        <h3>Riwayat versi</h3>
        <ol className="timeline">
          {data.changelog.map((v) => (
            <li key={v.version} className={v.version === data.version ? 'current' : ''}>
              <div className="tl-head"><b>v{v.version}</b>{v.date && <span className="t-sub">{fmtDate(v.date)}</span>}{v.version === data.version && <span className="pill tone-ok">Terpasang</span>}</div>
              <ul>{v.items.map((x) => <li key={x}>{x}</li>)}</ul>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
