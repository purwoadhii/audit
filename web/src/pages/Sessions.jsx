import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLES, device, fmtDateTime } from '../util.js';
import { ConfirmDelete, Empty, ErrorBox, Loading, useLoad, useToast } from '../components/ui.jsx';
import { t } from '../i18n.jsx';

export default function Sessions() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get('/admin/sessions'), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;

  async function end(id) {
    try {
      await api.del(`/admin/sessions/${id}`);
      toast(t('Sesi diakhiri'));
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="bar"><h2>{t('Sesi aktif')}</h2><span className="t-sub">{t('{n} perangkat sedang masuk', { n: data.length })}</span></div>
      {!data.length ? <Empty title={t('Tidak ada sesi aktif')} /> : (
        <div className="tablebox"><table>
          <thead><tr><th>{t('Pengguna')}</th><th>{t('Perangkat')}</th><th>{t('Alamat IP')}</th><th>{t('Masuk')}</th><th>{t('Terakhir aktif')}</th><th>{t('Jenis')}</th><th /></tr></thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <td className="t-title">{s.user_name}<div className="t-sub">{s.username} · {ROLES[s.role]}</div></td>
                <td title={s.user_agent || ''}>{device(s.user_agent)}</td>
                <td className="code">{s.ip || '—'}</td>
                <td className="num t-sub">{fmtDateTime(s.created_at)}</td>
                <td className="num t-sub">{fmtDateTime(s.last_seen_at)}</td>
                <td>{s.remember ? t('Ingat saya') : t('Biasa')}</td>
                <td>
                  {s.current ? <span className="t-sub">{t('Sesi ini')}</span>
                    : s.role === 'infraadmin' && user.role !== 'infraadmin' ? null
                      : <ConfirmDelete label={t('Paksa keluar')} question={t('Akhiri sesi ini?')} yes={t('Ya, keluarkan')} onConfirm={() => end(s.id)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
