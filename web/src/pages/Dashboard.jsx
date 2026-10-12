import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AUDIT_STATUS, RISKS, fmtDate, canEdit } from '../util.js';
import { Empty, ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import FindingSheet from '../components/FindingSheet.jsx';
import { Icon } from '../components/Icons.jsx';
import { t } from '../i18n.jsx';

function Kpi({ tone, icon, label, value, sub }) {
  return (
    <div className={`kpi tone-${tone}`}>
      <div className="kpi-ico"><Icon name={icon} size={20} /></div>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

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
      <Empty title={user.role === 'auditee' ? t('Belum ada temuan untuk Anda') : t('Belum ada audit')}
        action={canEdit(user) && <button className="btn primary" onClick={() => nav('/audit?baru=1')}>{t('Buat audit')}</button>}>
        {user.role === 'auditee' ? t('Temuan yang ditugaskan kepada Anda atau unit Anda akan muncul di sini.') : t('Mulai dengan membuat audit pertama. Program kerja, temuan, dan tindak lanjut akan muncul di sini.')}
      </Empty>
    );
  }

  const hour = new Date().getHours();
  const name = user.name.split(' ')[0];
  const greet = hour < 11 ? t('Selamat pagi, {name}', { name }) : hour < 15 ? t('Selamat siang, {name}', { name }) : hour < 18 ? t('Selamat sore, {name}', { name }) : t('Selamat malam, {name}', { name });
  return (
    <>
      <div className="greet">
        <h2>{greet}</h2>
        <p className="t-sub">{t('Kondisi audit dan tindak lanjut per {date}.', { date: fmtDate(new Date().toISOString()) })}</p>
      </div>
      <div className="kpis">
        <Kpi tone="accent" icon="audit" label={t('Audit berjalan')} value={auditTotal - auditCount('Selesai')} sub={t('dari {n} audit', { n: auditTotal })} />
        <Kpi tone="low" icon="finding" label={t('Temuan terbuka')} value={fOpen} sub={t('dari {n} temuan', { n: fTotal })} />
        <Kpi tone={overdue ? 'high' : 'muted'} icon="board" label={t('Lewat jatuh tempo')} value={overdue} sub={t('tindak lanjut terlambat')} />
        <Kpi tone="ok" icon="shield" label={t('Tindak lanjut selesai')} value={`${fTotal ? Math.round((fDone / fTotal) * 100) : 0}%`} sub={t('{n} temuan ditutup', { n: fDone })} />
      </div>
      <div className="grid2">
        <div className="panel">
          <h3>{t('Temuan terbuka per risiko')}</h3>
          {RISKS.map((r) => (
            <div className="riskbar" key={r}><span>{t(r)}</span><div className="track"><div className="fill" style={{ width: `${(openByRisk(r) / maxR) * 100}%`, background: RISK_COLOR[r] }} /></div><span className="n">{openByRisk(r)}</span></div>
          ))}
          <h3 style={{ marginTop: 18 }}>{t('Status audit')}</h3>
          {AUDIT_STATUS.map((s) => (
            <div className="riskbar" key={s}><span>{t(s)}</span><div className="track"><div className="fill" style={{ width: `${auditTotal ? (auditCount(s) / auditTotal) * 100 : 0}%`, background: 'var(--accent)' }} /></div><span className="n">{auditCount(s)}</span></div>
          ))}
        </div>
        <div className="stack">
          <div className="panel">
            <h3>{t('Tindak lanjut terdekat')}</h3>
            {data.upcoming.length ? (
              <ul className="list-plain">
                {data.upcoming.map((f) => (
                  <li key={f.id}><button onClick={() => setOpenId(f.id)}>
                    <span><span className="t-title">{f.title}</span><br /><span className="t-sub">{f.owner_name || t('Belum ada PIC')} · {f.audit_title}</span></span>
                    <span className={`num ${f.overdue ? 'overdue' : 't-sub'}`}>{fmtDate(f.due_date)}</span>
                  </button></li>
                ))}
              </ul>
            ) : <Empty small>{t('Semua temuan sudah ditindaklanjuti.')}</Empty>}
          </div>
          {data.byUnit.length > 0 && (
            <div className="panel">
              <h3>{t('Temuan terbuka per unit')}</h3>
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
