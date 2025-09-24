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

function LanguageSelector({ showLabel = true, compact = false }) {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const changeLanguage = (languageCode) => {
    i18n.changeLanguage(languageCode);
    setIsOpen(false);
  };

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-1 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={t('settings.language')}
        >
          <Globe className="h-4 w-4" />
          <span className="text-sm font-medium">{currentLanguage.flag}</span>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute right-0 mt-2 py-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 z-20">
              {languages.map((language) => (
                <button
                  key={language.code}
                  onClick={() => changeLanguage(language.code)}
                  className="flex items-center justify-between w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">{language.flag}</span>
                    <span>{language.nativeName}</span>
                  </div>
                  {i18n.language === language.code && (
                    <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('settings.language')}
        </label>
      )}

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Globe className="h-5 w-5 text-gray-400" />
            <span className="text-lg">{currentLanguage.flag}</span>
            <span className="text-gray-900 dark:text-gray-100">
              {currentLanguage.nativeName}
            </span>
          </div>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 max-h-60 overflow-auto">
              <div className="py-1">
                {languages.map((language) => (
                  <button
                    key={language.code}
                    onClick={() => changeLanguage(language.code)}
                    className="flex items-center justify-between w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-xl">{language.flag}</span>
                      <div className="text-left">
                        <div className="font-medium">{language.nativeName}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {language.name}
                        </div>
                      </div>
                    </div>
                    {i18n.language === language.code && (
                      <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LanguageSelector;