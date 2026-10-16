import { api } from '../api.js';
import { fmtDateTime, fmtSize } from '../util.js';
import { ConfirmDelete, Empty, ErrorBox, Loading, BusyButton, useLoad, useToast } from '../components/ui.jsx';
import { Section } from './Settings.jsx';
import { useSettings } from '../settings.jsx';
import { N_, t } from '../i18n.jsx';

const REASON = { manual: N_('Manual'), otomatis: N_('Otomatis') };

// Backup database (Infra Admin): jadwal, backup sekarang, dan daftar file untuk diunduh.
export default function Backup() {
  const toast = useToast();
  const { reload: reloadApp } = useSettings();
  const status = useLoad(() => api.get('/admin/backups'), []);
  const settings = useLoad(() => api.get('/settings'), []);

  async function runNow() {
    const data = await api.post('/admin/backups', {});
    status.setData(data);
    toast(t('Backup selesai: {name}', { name: data.last.file }));
  }
  async function remove(name) {
    try {
      status.setData(await api.del(`/admin/backups/${encodeURIComponent(name)}`));
      toast(t('File backup dihapus'));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if ((status.loading && !status.data) || (settings.loading && !settings.data)) return <Loading />;
  if (status.error || settings.error) return <ErrorBox error={status.error || settings.error} retry={() => { status.reload(); settings.reload(); }} />;
  const { last, files, dir } = status.data;
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="bar" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{t('Backup database')}</h3>
          <span className="bar-actions"><BusyButton className="btn primary" onClick={runNow}>{t('Backup sekarang')}</BusyButton></span>
        </div>
        <p className="t-sub" style={{ marginTop: 0 }}>
          {t('Backup berisi seluruh isi database dalam satu file .sql.gz. Untuk memulihkan, impor file itu lewat phpMyAdmin (tab Import). File bukti di folder upload tidak ikut dan perlu disalin terpisah.')}
        </p>
        <p className="t-sub">{t('Folder backup di server: {dir}', { dir })}</p>
        {last && (
          last.ok
            ? <div className="notice">{t('Backup terakhir {date} ({reason}), {size}.', { date: fmtDateTime(last.at), reason: t(REASON[last.reason] || last.reason), size: fmtSize(last.size) })}</div>
            : <div className="notice bad-text" role="alert">{t('Backup terakhir {date} gagal: {error}', { date: fmtDateTime(last.at), error: last.error })}</div>
        )}
      </section>
      <Section title={N_('Jadwal backup')} keys={['backup_enabled', 'backup_hour', 'backup_keep']} data={settings.data} onSaved={() => { settings.reload(); reloadApp(); }} />
      <section className="panel">
        <h3>{t('File backup ({n})', { n: files.length })}</h3>
        {!files.length ? <Empty small>{t('Belum ada file backup.')}</Empty> : (
          <table>
            <thead><tr><th>{t('File')}</th><th>{t('Waktu')}</th><th className="num">{t('Ukuran')}</th><th /></tr></thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.name}>
                  <td className="code"><a href={`/api/admin/backups/${encodeURIComponent(f.name)}?portal=infra`} download>{f.name}</a></td>
                  <td className="num t-sub">{fmtDateTime(f.created_at)}</td>
                  <td className="num">{fmtSize(f.size)}</td>
                  <td className="act-col"><ConfirmDelete question={t('Hapus file backup ini?')} onConfirm={() => remove(f.name)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
