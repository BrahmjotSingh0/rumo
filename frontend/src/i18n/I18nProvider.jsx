import { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import langData from './lang.json';

const { languages, strings, defaultLanguage, rtlLanguages = [] } = langData;
const STORAGE_KEY = 'rumo_language';

function getInitialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && languages[stored]) return stored;
  } catch {
    // localStorage unavailable (private mode, etc.) - fall through to browser detection
  }
  const browserLang = (navigator.language || defaultLanguage).split('-')[0];
  return languages[browserLang] ? browserLang : defaultLanguage;
}

const I18nContext = createContext(null);

export const I18nProvider = ({ children }) => {
  const [language, setLanguageState] = useState(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = rtlLanguages.includes(language) ? 'rtl' : 'ltr';
  }, [language]);

  const setLanguage = useCallback((code) => {
    if (!languages[code]) return;
    setLanguageState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore - nothing we can do if storage is blocked
    }
  }, []);

  // t('some.key', { name: 'Ann' }) looks up strings["some.key"][language] and
  // replaces {{name}} placeholders. Falls back to the default language, then the key itself.
  const t = useCallback((key, vars) => {
    const entry = strings[key];
    let value = entry?.[language] ?? entry?.[defaultLanguage] ?? key;
    if (vars) {
      for (const [varName, varValue] of Object.entries(vars)) {
        value = value.replace(new RegExp(`{{${varName}}}`, 'g'), varValue);
      }
    }
    return value;
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    availableLanguages: Object.entries(languages).map(([code, label]) => ({ code, label })),
  }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useTranslation = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within I18nProvider');
  }
  return ctx;
};
