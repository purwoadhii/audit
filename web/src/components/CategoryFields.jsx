import { useSettings } from '../settings.jsx';
import { t } from '../i18n.jsx';

// Pilihan dari pengaturan, ditambah nilai lama bila sudah dihapus dari daftar.
const withCurrent = (list, value) => (value && !list.includes(value) ? [value, ...list] : list);

// Kategori temuan dan kategori akar masalah, dipakai di form temuan tunggal dan isian massal.
export default function CategoryFields({ category, rootCause, onChange, idPrefix = 'f' }) {
  const { settings } = useSettings();
  return (
    <>
      <label>{t('Kategori temuan')}
        <select id={`${idPrefix}-category`} value={category || ''} onChange={(e) => onChange('category', e.target.value)}>
          <option value="">{t('Belum dipilih')}</option>
          {withCurrent(settings.finding_categories, category).map((c) => <option key={c} value={c}>{t(c)}</option>)}
        </select>
      </label>
      <label>{t('Kategori akar masalah')}
        <select id={`${idPrefix}-root`} value={rootCause || ''} onChange={(e) => onChange('root_cause', e.target.value)}>
          <option value="">{t('Belum dipilih')}</option>
          {withCurrent(settings.root_causes, rootCause).map((c) => <option key={c} value={c}>{t(c)}</option>)}
        </select>
      </label>
    </>
  );
}
