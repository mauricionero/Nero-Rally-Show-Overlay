// Translation Configuration
// Add new languages here by importing the YAML file and adding to the languages array

// Language definitions with metadata
// To add a new language:
// 1. Create a new YAML file (e.g., pt-BR.yaml) by copying en.yaml
// 2. Translate all strings in the new file
// 3. Import the file below
// 4. Add an entry to the 'languages' array

export const languages = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
    file: 'en.yaml'
  },
  {
    code: 'pt-BR',
    name: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
    flag: '🇧🇷',
    file: 'pt-BR.yaml'
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    file: 'es.yaml'
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    file: 'fr.yaml'
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    file: 'de.yaml'
  },
  {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    file: 'it.yaml'
  }
];

// Default language code
export const defaultLanguage = 'en';

// Get language metadata by code
export const getLanguageByCode = (code) => {
  return languages.find(lang => lang.code === code) || languages[0];
};

// Get available language codes
export const getAvailableLanguageCodes = () => {
  return languages.map(lang => lang.code);
};
