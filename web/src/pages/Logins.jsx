import { useState } from 'react';
import { api } from '../api.js';
import { ROLES, LOGIN_REASON, device, fmtDateTime } from '../util.js';
import { Empty, ErrorBox, Loading, useLoad } from '../components/ui.jsx';

export default function Logins() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, loading, reload } = useLoad(
    () => api.get(`/admin/logins?${new URLSearchParams({ status, q: query })}`),
    [status, query],
  );
  return (
    <>
      <div className="bar"><h2>Riwayat login</h2><span className="t-sub">200 percobaan terakhir</span></div>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <input id="l-q" type="search" placeholder="Cari username, nama, atau IP" value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="l-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          <option value="berhasil">Berhasil</option>
          <option value="gagal">Gagal</option>
        </select>
        <button className="btn">Cari</button>
      </form>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !data.length ? <Empty title="Belum ada riwayat login" /> : (
        <div className="tablebox"><table>
          <thead><tr><th>Waktu</th><th>Pengguna</th><th>Username dipakai</th><th>Hasil</th><th>Alamat IP</th><th>Perangkat</th></tr></thead>
          <tbody>
            {data.map((l) => (
              <tr key={l.id}>
                <td className="num t-sub">{fmtDateTime(l.created_at)}</td>
                <td>{l.user_name ? <>{l.user_name}<div className="t-sub">{ROLES[l.role]}</div></> : '—'}</td>
                <td className="code">{l.login}</td>
                <td>{l.success ? <span className="ok-text">Berhasil</span> : <span className="bad-text">{LOGIN_REASON[l.reason] || 'Gagal'}</span>}</td>
                <td className="code">{l.ip || '—'}</td>
                <td title={l.user_agent || ''}>{device(l.user_agent)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
