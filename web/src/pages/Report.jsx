import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDate } from '../util.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import { t } from '../i18n.jsx';

export default function Report() {
  const { id } = useParams();
  const { data: a, error, loading, reload } = useLoad(() => api.get(`/audits/${id}`), [id]);
  if (loading && !a) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const count = (r) => a.findings.filter((f) => f.risk === r).length;
  const done = a.steps.filter((s) => s.result !== 'Belum diuji').length;
  return (
    <>
      <div className="bar no-print">
        <Link className="btn ghost" to={`/audit/${a.id}`}>{t('← Kembali ke audit')}</Link>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn primary" onClick={() => window.print()}>{t('Cetak / simpan PDF')}</button>
      </div>
      <article className="report">
        <div className="code">{a.code}</div>
        <h1>{t('Laporan Hasil Audit: {title}', { title: a.title })}</h1>
        <div className="t-sub">{t('Dicetak {date}', { date: fmtDate(new Date().toISOString()) })}</div>
        <h2>{t('Informasi audit')}</h2>
        <div className="kv">
          <b>{t('Auditee')}</b><span>{a.unit}</span>
          <b>{t('Jenis audit')}</b><span>{t(a.type)}</span>
          <b>{t('Ketua tim')}</b><span>{a.lead_name || '—'}</span>
          <b>{t('Anggota tim')}</b><span>{(a.members || []).map((m) => m.name).join(', ') || '—'}</span>
          <b>{t('Anggota eksternal')}</b><span>{a.team || '—'}</span>
          <b>{t('Periode')}</b><span>{t('{start} s.d. {end}', { start: fmtDate(a.start_date), end: fmtDate(a.end_date) })}</span>
          <b>{t('Status')}</b><span>{t(a.status)}</span>
        </div>
        <h2>{t('Ruang lingkup dan tujuan')}</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{a.scope || '—'}</p>
        <h2>{t('Program kerja ({done}/{total} langkah diuji)', { done, total: a.steps.length })}</h2>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>{t('No.')}</th><th>{t('Langkah pengujian')}</th><th>{t('Hasil')}</th><th>{t('Catatan')}</th></tr></thead>
            <tbody>{a.steps.map((s, i) => <tr key={s.id}><td className="num">{i + 1}</td><td>{s.text}</td><td>{t(s.result)}</td><td style={{ whiteSpace: 'pre-wrap' }}>{s.note || '—'}</td></tr>)}</tbody>
          </table>
        </div>
        <h2>{t('Temuan dan rekomendasi')}</h2>
        <p>{t('{n} temuan: risiko tinggi {high}, sedang {med}, rendah {low}.', { n: a.findings.length, high: count('Tinggi'), med: count('Sedang'), low: count('Rendah') })}</p>
        {a.findings.map((f, i) => (
          <div className="finding" key={f.id}>
            <div className="code">{f.code}</div>
            <b>{i + 1}. {f.title}</b> <span className="t-sub">· {t('Risiko {risk}', { risk: t(f.risk) })} · {t(f.status)}</span>
            <dl>
              <dt>{t('Kondisi')}</dt><dd>{f.condition || '—'}</dd>
              <dt>{t('Kriteria')}</dt><dd>{f.criteria || '—'}</dd>
              <dt>{t('Sebab')}</dt><dd>{f.cause || '—'}</dd>
              <dt>{t('Akibat')}</dt><dd>{f.effect || '—'}</dd>
              <dt>{t('Rekomendasi')}</dt><dd>{f.recommendation || '—'}</dd>
              <dt>{t('Tanggapan')}</dt><dd>{f.response || '—'}</dd>
              <dt>{t('PIC / batas')}</dt><dd>{f.owner_name || '—'} / {fmtDate(f.due_date)}</dd>
            </dl>
          </div>
        ))}
        <div className="sign">
          <span>{t('Ketua Tim Audit')}<div />{a.lead_name || ''}</span>
          <span>{t('Pimpinan {unit}', { unit: a.unit })}<div /></span>
        </div>
      </article>
    </>
  );
}
