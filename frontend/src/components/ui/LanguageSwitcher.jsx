import { IconWorld as Globe } from '@tabler/icons-react'
import { useTranslation } from '../../i18n/I18nProvider';

const LanguageSwitcher = ({ className = '' }) => {
  const { language, setLanguage, availableLanguages, t } = useTranslation();

  return (
    <label className={`flex items-center gap-2 text-gray-400 ${className}`}>
      <Globe className="w-4 h-4" />
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="bg-gray-800/50 border border-gray-600 rounded-lg text-sm text-gray-200 py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {availableLanguages.map(({ code, label }) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSwitcher;
