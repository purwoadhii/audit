import { useState } from 'react';
import { api } from '../api.js';
import { ROLES, LOGIN_REASON, device, fmtDateTime } from '../util.js';
import { Empty, ErrorBox, Loading, Pager, useLoad, usePaged } from '../components/ui.jsx';
import { t } from '../i18n.jsx';

export default function Logins() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, loading, reload } = useLoad(
    () => api.get(`/admin/logins?${new URLSearchParams({ status, q: query })}`),
    [status, query],
  );
  const paged = usePaged(data || [], `${status}|${query}`);
  return (
    <>
      <div className="bar"><h2>{t('Riwayat login')}</h2><span className="t-sub">{t('200 percobaan terakhir')}</span></div>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <input id="l-q" type="search" placeholder={t('Cari username, nama, atau IP')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="l-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('Semua status')}</option>
          <option value="berhasil">{t('Berhasil')}</option>
          <option value="gagal">{t('Gagal')}</option>
        </select>
        <button className="btn">{t('Cari')}</button>
      </form>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !data.length ? <Empty title={t('Belum ada riwayat login')} /> : (
        <div className="tablebox"><table>
          <thead><tr><th>{t('Waktu')}</th><th>{t('Pengguna')}</th><th>{t('Username dipakai')}</th><th>{t('Hasil')}</th><th>{t('Alamat IP')}</th><th>{t('Perangkat')}</th></tr></thead>
          <tbody>
            {paged.rows.map((l) => (
              <tr key={l.id}>
                <td className="num t-sub">{fmtDateTime(l.created_at)}</td>
                <td>{l.user_name ? <>{l.user_name}<div className="t-sub">{ROLES[l.role]}</div></> : '—'}</td>
                <td className="code">{l.login}</td>
                <td>{l.success ? <span className="ok-text">{l.reason === 'sso' ? t('Berhasil lewat SSO') : t('Berhasil')}</span> : <span className="bad-text">{LOGIN_REASON[l.reason] || t('Gagal')}</span>}</td>
                <td className="code">{l.ip || '—'}</td>
                <td title={l.user_agent || ''}>{device(l.user_agent)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {data?.length > 0 && <Pager paged={paged} />}
    </>
  );
}
