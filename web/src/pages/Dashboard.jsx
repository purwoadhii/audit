import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AUDIT_STATUS, RISKS, fmtDate, canEdit } from '../util.js';
import { Empty, ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import FindingSheet from '../components/FindingSheet.jsx';

const RISK_COLOR = { Tinggi: 'var(--high)', Sedang: 'var(--med)', Rendah: 'var(--low)' };

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, error, loading, reload } = useLoad(() => api.get('/dashboard'), []);
  const [openId, setOpenId] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;

  const auditTotal = data.audits.reduce((s, a) => s + a.n, 0);
  const auditCount = (st) => data.audits.find((a) => a.status === st)?.n || 0;
  const fTotal = data.findings.reduce((s, f) => s + f.n, 0);
  const fOpen = data.findings.filter((f) => f.status !== 'Selesai').reduce((s, f) => s + f.n, 0);
  const fDone = fTotal - fOpen;
  const overdue = data.findings.reduce((s, f) => s + f.overdue, 0);
  const openByRisk = (r) => data.findings.filter((f) => f.risk === r && f.status !== 'Selesai').reduce((s, f) => s + f.n, 0);
  const maxR = Math.max(1, ...RISKS.map(openByRisk));

  if (!auditTotal && !fTotal) {
    return (
      <Empty title={user.role === 'auditee' ? 'Belum ada temuan untuk Anda' : 'Belum ada audit'}
        action={canEdit(user) && <button className="btn primary" onClick={() => nav('/audit?baru=1')}>Buat audit</button>}>
        {user.role === 'auditee' ? 'Temuan yang ditugaskan kepada Anda atau unit Anda akan muncul di sini.' : 'Mulai dengan membuat audit pertama. Program kerja, temuan, dan tindak lanjut akan muncul di sini.'}
      </Empty>
    );
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="lbl">Audit berjalan</div><div className="val">{auditTotal - auditCount('Selesai')}</div><div className="sub">dari {auditTotal} audit</div></div>
        <div className="kpi"><div className="lbl">Temuan terbuka</div><div className="val">{fOpen}</div><div className="sub">dari {fTotal} temuan</div></div>
        <div className={`kpi${overdue ? ' alert' : ''}`}><div className="lbl">Lewat jatuh tempo</div><div className="val">{overdue}</div><div className="sub">tindak lanjut terlambat</div></div>
        <div className="kpi"><div className="lbl">Tindak lanjut selesai</div><div className="val">{fTotal ? Math.round((fDone / fTotal) * 100) : 0}%</div><div className="sub">{fDone} temuan ditutup</div></div>
      </div>
      <div className="grid2">
        <div className="panel">
          <h3>Temuan terbuka per risiko</h3>
          {RISKS.map((r) => (
            <div className="riskbar" key={r}><span>{r}</span><div className="track"><div className="fill" style={{ width: `${(openByRisk(r) / maxR) * 100}%`, background: RISK_COLOR[r] }} /></div><span className="n">{openByRisk(r)}</span></div>
          ))}
          <h3 style={{ marginTop: 18 }}>Status audit</h3>
          {AUDIT_STATUS.map((s) => (
            <div className="riskbar" key={s}><span>{s}</span><div className="track"><div className="fill" style={{ width: `${auditTotal ? (auditCount(s) / auditTotal) * 100 : 0}%`, background: 'var(--accent)' }} /></div><span className="n">{auditCount(s)}</span></div>
          ))}
        </div>
        <div className="stack">
          <div className="panel">
            <h3>Tindak lanjut terdekat</h3>
            {data.upcoming.length ? (
              <ul className="list-plain">
                {data.upcoming.map((f) => (
                  <li key={f.id}><button onClick={() => setOpenId(f.id)}>
                    <span><span className="t-title">{f.title}</span><br /><span className="t-sub">{f.owner_name || 'Belum ada PIC'} · {f.audit_title}</span></span>
                    <span className={`num ${f.overdue ? 'overdue' : 't-sub'}`}>{fmtDate(f.due_date)}</span>
                  </button></li>
                ))}
              </ul>
            ) : <Empty small>Semua temuan sudah ditindaklanjuti.</Empty>}
          </div>
          {data.byUnit.length > 0 && (
            <div className="panel">
              <h3>Temuan terbuka per unit</h3>
              {data.byUnit.map((u) => (
                <div className="riskbar" key={u.unit}><span title={u.unit} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.unit}</span><div className="track"><div className="fill" style={{ width: `${u.total ? (u.open / u.total) * 100 : 0}%`, background: 'var(--med)' }} /></div><span className="n">{u.open}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>
      {openId && <FindingSheet id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}
