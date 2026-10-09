import { useState } from 'react';
import { api } from '../api.js';
import { FINDING_STATUS, fmtDate } from '../util.js';
import { Empty, ErrorBox, Loading, useLoad } from '../components/ui.jsx';
import FindingSheet from '../components/FindingSheet.jsx';

export default function Board() {
  const { data, error, loading, reload } = useLoad(() => api.get('/findings'), []);
  const [openId, setOpenId] = useState(null);
  return (
    <>
      <div className="bar"><h2>Tindak lanjut rekomendasi</h2><span className="t-sub">Klik kartu untuk memperbarui progres</span></div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !data.length ? (
        <Empty title="Belum ada rekomendasi untuk dipantau">Setiap temuan yang dicatat otomatis masuk ke papan ini.</Empty>
      ) : (
        <div className="board">
          {FINDING_STATUS.map((s) => {
            const items = data.filter((f) => f.status === s).sort((a, b) => String(a.due_date || '9').localeCompare(String(b.due_date || '9')));
            return (
              <div className="col" key={s}>
                <h4><span>{s}</span><span className="t-sub num">{items.length}</span></h4>
                {items.map((f) => (
                  <button key={f.id} className={`card k-${f.risk}`} onClick={() => setOpenId(f.id)}>
                    <div className="code">{f.code}</div>
                    <div className="t-title">{f.title}</div>
                    <div className="meta"><span>{f.owner_name || 'Belum ada PIC'}</span><span className={`num ${f.overdue ? 'overdue' : ''}`}>{fmtDate(f.due_date)}</span></div>
                  </button>
                ))}
                {!items.length && <Empty small>Kosong</Empty>}
              </div>
            );
          })}
        </div>
      )}
      {openId && <FindingSheet id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}
