import { api } from '../api.js';
import { fmtDateTime } from '../util.js';
import { Empty, ErrorBox, Loading, useLoad } from '../components/ui.jsx';

const ACTION = { create: 'membuat', update: 'mengubah', delete: 'menghapus', upload: 'mengunggah', ocr: 'membaca dengan OCR' };
const ENTITY = { audit: 'audit', finding: 'temuan', user: 'pengguna', attachment: 'file bukti', setting: 'pengaturan', file: 'file' };

function describe(l) {
  const d = l.detail || {};
  const what = d.code || d.title || d.filename || d.email || (l.entity_id ? `#${l.entity_id}` : '');
  return `${ACTION[l.action] || l.action} ${ENTITY[l.entity] || l.entity} ${what}`.trim();
}

export default function Activity() {
  const { data, error, loading, reload } = useLoad(() => api.get('/dashboard/activity'), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <>
      <div className="bar"><h2>Log aktivitas</h2><span className="t-sub">100 aktivitas terakhir</span></div>
      {!data.length ? <Empty title="Belum ada aktivitas" /> : (
        <div className="tablebox"><table>
          <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aktivitas</th></tr></thead>
          <tbody>{data.map((l) => <tr key={l.id}><td className="num t-sub">{fmtDateTime(l.created_at)}</td><td>{l.user_name || '—'}</td><td>{describe(l)}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
