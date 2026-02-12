import React from 'react';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Globe } from 'lucide-react';

export function LanguageSelector({ className = '', showLabel = true }) {
  const { currentLanguage, changeLanguage, languages, t } = useTranslation();

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {showLabel && (
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-zinc-400" />
          <span className="text-white text-sm font-medium">{t('config.language')}</span>
        </div>
      )}
      <Select value={currentLanguage} onValueChange={changeLanguage}>
        <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white min-w-[200px]" data-testid="language-selector">
          <SelectValue>
            {languages.find(l => l.code === currentLanguage)?.flag}{' '}
            {languages.find(l => l.code === currentLanguage)?.nativeName}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {languages.map((lang) => (
            <SelectItem 
              key={lang.code} 
              value={lang.code}
              data-testid={`language-option-${lang.code}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{lang.flag}</span>
                <span>{lang.nativeName}</span>
                {lang.nativeName !== lang.name && (
                  <span className="text-zinc-500 text-xs">({lang.name})</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Compact version for header/navbar
export function LanguageSelectorCompact({ className = '' }) {
  const { currentLanguage, changeLanguage, languages } = useTranslation();
  const currentLang = languages.find(l => l.code === currentLanguage);

  return (
    <Select value={currentLanguage} onValueChange={changeLanguage}>
      <SelectTrigger 
        className={`bg-transparent border-zinc-700 text-white w-auto min-w-0 px-2 ${className}`}
        data-testid="language-selector-compact"
      >
        <SelectValue>
          <span className="text-lg">{currentLang?.flag}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {languages.map((lang) => (
          <SelectItem 
            key={lang.code} 
            value={lang.code}
            data-testid={`language-option-${lang.code}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{lang.flag}</span>
              <span>{lang.nativeName}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
