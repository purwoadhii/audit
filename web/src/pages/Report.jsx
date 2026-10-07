import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDate } from '../util.js';
import { ErrorBox, Loading, useLoad } from '../components/ui.jsx';

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
        <Link className="btn ghost" to={`/audit/${a.id}`}>← Kembali ke audit</Link>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn primary" onClick={() => window.print()}>Cetak / simpan PDF</button>
      </div>
      <article className="report">
        <div className="code">{a.code}</div>
        <h1>Laporan Hasil Audit: {a.title}</h1>
        <div className="t-sub">Dicetak {fmtDate(new Date().toISOString())}</div>
        <h2>Informasi audit</h2>
        <div className="kv">
          <b>Auditee</b><span>{a.unit}</span>
          <b>Jenis audit</b><span>{a.type}</span>
          <b>Ketua tim</b><span>{a.lead_name || '—'}</span>
          <b>Anggota tim</b><span>{(a.members || []).map((m) => m.name).join(', ') || '—'}</span>
          <b>Anggota eksternal</b><span>{a.team || '—'}</span>
          <b>Periode</b><span>{fmtDate(a.start_date)} s.d. {fmtDate(a.end_date)}</span>
          <b>Status</b><span>{a.status}</span>
        </div>
        <h2>Ruang lingkup dan tujuan</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{a.scope || '—'}</p>
        <h2>Program kerja ({done}/{a.steps.length} langkah diuji)</h2>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>No.</th><th>Langkah pengujian</th><th>Hasil</th><th>Catatan</th></tr></thead>
            <tbody>{a.steps.map((s, i) => <tr key={s.id}><td className="num">{i + 1}</td><td>{s.text}</td><td>{s.result}</td><td style={{ whiteSpace: 'pre-wrap' }}>{s.note || '—'}</td></tr>)}</tbody>
          </table>
        </div>
        <h2>Temuan dan rekomendasi</h2>
        <p>{a.findings.length} temuan: risiko tinggi {count('Tinggi')}, sedang {count('Sedang')}, rendah {count('Rendah')}.</p>
        {a.findings.map((f, i) => (
          <div className="finding" key={f.id}>
            <div className="code">{f.code}</div>
            <b>{i + 1}. {f.title}</b> <span className="t-sub">· Risiko {f.risk} · {f.status}</span>
            <dl>
              <dt>Kondisi</dt><dd>{f.condition || '—'}</dd>
              <dt>Kriteria</dt><dd>{f.criteria || '—'}</dd>
              <dt>Sebab</dt><dd>{f.cause || '—'}</dd>
              <dt>Akibat</dt><dd>{f.effect || '—'}</dd>
              <dt>Rekomendasi</dt><dd>{f.recommendation || '—'}</dd>
              <dt>Tanggapan</dt><dd>{f.response || '—'}</dd>
              <dt>PIC / batas</dt><dd>{f.owner_name || '—'} / {fmtDate(f.due_date)}</dd>
            </dl>
          </div>
        ))}
        <div className="sign">
          <span>Ketua Tim Audit<div />{a.lead_name || ''}</span>
          <span>Pimpinan {a.unit}<div /></span>
        </div>
      </article>
    </>
  );
}
