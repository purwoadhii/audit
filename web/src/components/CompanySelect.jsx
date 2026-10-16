import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { companyMode } from '../company.js';
import { t } from '../i18n.jsx';

// Pilihan perusahaan untuk multi-entitas. Tidak tampil bila fitur mati.
// Pengguna yang terikat perusahaan tidak bisa memilih perusahaan lain.
export default function CompanySelect({ id, value, onChange, full = false }) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const cm = companyMode(settings, user);
  if (!cm.on) return null;
  return (
    <label className={full ? 'full' : ''}>{t('Perusahaan')}
      <select id={id} value={value || ''} onChange={onChange} disabled={Boolean(cm.own)}>
        <option value="">{t('Tanpa perusahaan')}</option>
        {[...new Set([...cm.list, value].filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}
