import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtDate, canEdit } from '../util.js';
import { Empty, ErrorBox, Loading, StatusPill, useLoad } from '../components/ui.jsx';
import AuditForm from '../components/AuditForm.jsx';
import { t } from '../i18n.jsx';

export default function Audits() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useLoad(() => api.get('/audits'), []);
  const [q, setQ] = useState('');
  const creating = params.get('baru') === '1';
  const setCreating = (v) => setParams(v ? { baru: '1' } : {}, { replace: true });

  const head = (
    <div className="bar">
      <h2>{t('Daftar audit')}</h2>
      {canEdit(user) && <button className="btn primary" onClick={() => setCreating(true)}>{t('Buat audit')}</button>}
    </div>
  );
  let body;
  if (loading && !data) body = <Loading />;
  else if (error) body = <ErrorBox error={error} retry={reload} />;
  else if (!data.length) body = <Empty title={t('Belum ada audit')}>{t('Buat audit, pilih template program kerja, lalu catat hasil pengujian.')}</Empty>;
  else {
    const needle = q.toLowerCase();
    const rows = data.filter((a) => !needle || `${a.code} ${a.title} ${a.unit} ${a.lead_name || ''}`.toLowerCase().includes(needle));
    body = (
      <>
        <div className="filters"><input id="audit-q" placeholder={t('Cari judul, unit, atau ketua tim')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="tablebox">
          <table>
            <thead><tr><th>{t('No.')}</th><th>{t('Audit')}</th><th>{t('Ketua tim')}</th><th>{t('Periode')}</th><th>{t('Program kerja')}</th><th>{t('Temuan')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const pct = a.steps_total ? Math.round((a.steps_done / a.steps_total) * 100) : 0;
                return (
                  <tr key={a.id} className="click" onClick={() => nav(`/audit/${a.id}`)}>
                    <td className="code">{a.code}</td>
                    <td><div className="t-title">{a.title}</div><div className="t-sub">{a.unit} · {t(a.type)}</div></td>
                    <td>{a.lead_name || '—'}</td>
                    <td className="num">{fmtDate(a.start_date)} – {fmtDate(a.end_date)}</td>
                    <td><div className="progress"><div style={{ width: `${pct}%` }} /></div><div className="t-sub num">{t('{done}/{total} langkah', { done: a.steps_done, total: a.steps_total })}</div></td>
                    <td className="num">{a.findings_total} <span className="t-sub">{t('({n} terbuka)', { n: a.findings_open })}</span></td>
                    <td><StatusPill value={a.status} /></td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={7}><Empty small>{t('Tidak ada audit yang cocok.')}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </>
    );
  }
  return (
    <>
      {head}
      {body}
      {creating && <AuditForm onClose={() => setCreating(false)} onSaved={(a) => nav(`/audit/${a.id}`)} />}
    </>
  );
}
