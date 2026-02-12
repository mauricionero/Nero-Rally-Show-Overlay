import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import yaml from 'js-yaml';
import { languages, defaultLanguage, getLanguageByCode } from '../translations/config';

const TranslationContext = createContext();

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within TranslationProvider');
  }
  return context;
};

// Helper to get nested value from object using dot notation
const getNestedValue = (obj, path, fallback = '') => {
  if (!obj || !path) return fallback;
  
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return fallback;
    }
  }
  
  return value || fallback;
};

// Cache for loaded translations
const translationsCache = {};

export const TranslationProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState(() => {
    const saved = localStorage.getItem('rally_language');
    return saved || defaultLanguage;
  });
  
  const [translations, setTranslations] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadedLanguages, setLoadedLanguages] = useState([]);

  // Load translation file
  const loadTranslation = useCallback(async (langCode) => {
    // Check cache first
    if (translationsCache[langCode]) {
      return translationsCache[langCode];
    }

    try {
      const langConfig = getLanguageByCode(langCode);
      // Use PUBLIC_URL for GitHub Pages compatibility
      const basePath = process.env.PUBLIC_URL || '';
      const response = await fetch(`${basePath}/translations/${langConfig.file}`);
      
      if (!response.ok) {
        console.warn(`Translation file not found for ${langCode}, falling back to English`);
        if (langCode !== 'en') {
          return loadTranslation('en');
        }
        return {};
      }
      
      const yamlText = await response.text();
      const parsed = yaml.load(yamlText);
      
      // Cache the translation
      translationsCache[langCode] = parsed;
      
      return parsed;
    } catch (error) {
      console.error(`Error loading translation for ${langCode}:`, error);
      if (langCode !== 'en') {
        return loadTranslation('en');
      }
      return {};
    }
  }, []);

  // Load current language translation
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      
      // Always load English as fallback
      const enTranslation = await loadTranslation('en');
      
      let currentTranslation = enTranslation;
      if (currentLanguage !== 'en') {
        const langTranslation = await loadTranslation(currentLanguage);
        // Merge with English as fallback
        currentTranslation = deepMerge(enTranslation, langTranslation);
      }
      
      setTranslations(currentTranslation);
      setLoadedLanguages(prev => 
        prev.includes(currentLanguage) ? prev : [...prev, currentLanguage]
      );
      setIsLoading(false);
    };
    
    load();
  }, [currentLanguage, loadTranslation]);

  // Save language preference
  useEffect(() => {
    localStorage.setItem('rally_language', currentLanguage);
  }, [currentLanguage]);

  // Translation function
  const t = useCallback((key, params = {}) => {
    let value = getNestedValue(translations, key, key);
    
    // Replace parameters like {name} with actual values
    if (typeof value === 'string' && Object.keys(params).length > 0) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        value = value.replace(new RegExp(`{${paramKey}}`, 'g'), paramValue);
      });
    }
    
    return value;
  }, [translations]);

  // Change language
  const changeLanguage = useCallback((langCode) => {
    if (languages.some(lang => lang.code === langCode)) {
      setCurrentLanguage(langCode);
    }
  }, []);

  // Get current language metadata
  const getCurrentLanguage = useCallback(() => {
    return getLanguageByCode(currentLanguage);
  }, [currentLanguage]);

  // Check if a language file exists (is available)
  const isLanguageAvailable = useCallback((langCode) => {
    return loadedLanguages.includes(langCode) || langCode === 'en';
  }, [loadedLanguages]);

  const value = {
    t,
    currentLanguage,
    changeLanguage,
    getCurrentLanguage,
    languages,
    isLoading,
    isLanguageAvailable
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
};

// Deep merge helper for fallback translations
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else if (source[key] !== undefined && source[key] !== '') {
      result[key] = source[key];
    }
  }
  
  return result;
}
