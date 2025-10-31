import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';

const languages = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸'
  },
  {
    code: 'cs',
    name: 'Czech',
    nativeName: 'Čeština',
    flag: '🇨🇿'
  }
];

function LanguageSelector({ showLabel = true, compact = false, onLanguageChange }) {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const changeLanguage = async (languageCode) => {
    if (languageCode === i18n.language) {
      setIsOpen(false);
      return;
    }

    await i18n.changeLanguage(languageCode);
    if (onLanguageChange) {
      await onLanguageChange(languageCode);
    }
    setIsOpen(false);
  };

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="btn-ghost p-2 flex items-center space-x-2 rounded-lg"
          title={t('navigation.language', 'Change language')}
        >
          <Globe className="h-4 w-4" />
          <span className="text-lg">{currentLanguage.flag}</span>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-[100]"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute right-0 mt-2 w-48 glass rounded-xl shadow-xl border border-white/20 z-[101] animate-fade-in">
              {languages.map((language) => (
                <button
                  key={language.code}
                  onClick={() => changeLanguage(language.code)}
                  className={`flex items-center justify-between w-full px-4 py-3 text-sm transition-all duration-200 first:rounded-t-xl last:rounded-b-xl ${i18n.language === language.code
                      ? 'bg-primary/10 text-primary border-r-4 border-primary'
                      : 'text-gray-700 hover:bg-white/50'
                    }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">{language.flag}</span>
                    <span className="font-medium">{language.nativeName}</span>
                  </div>
                  {i18n.language === language.code && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {showLabel && (
        <label className="form-label">
          {t('navigation.language', 'Language')}
        </label>
      )}

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="input-field flex items-center justify-between w-full hover:bg-white/80 focus:bg-white"
        >
          <div className="flex items-center space-x-3">
            <Globe className="h-4 w-4 text-gray-500" />
            <span className="text-lg">{currentLanguage.flag}</span>
            <span className="font-medium text-gray-900">
              {currentLanguage.nativeName}
            </span>
          </div>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-[100]"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute z-[101] mt-1 w-full glass rounded-xl shadow-xl border border-white/20 max-h-60 overflow-auto animate-fade-in">
              {languages.map((language) => (
                <button
                  key={language.code}
                  onClick={() => changeLanguage(language.code)}
                  className={`flex items-center justify-between w-full px-4 py-3 text-sm transition-all duration-200 first:rounded-t-xl last:rounded-b-xl ${i18n.language === language.code
                      ? 'bg-primary/10 text-primary border-r-4 border-primary'
                      : 'text-gray-700 hover:bg-white/50'
                    }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-xl">{language.flag}</span>
                    <div className="text-left">
                      <div className="font-medium">{language.nativeName}</div>
                      <div className="text-xs text-gray-500">
                        {language.name}
                      </div>
                    </div>
                  </div>
                  {i18n.language === language.code && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LanguageSelector;
