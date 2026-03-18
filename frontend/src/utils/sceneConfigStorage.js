export const loadSceneConfig = (storageKey, defaults) => {
  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return defaults;
    }

    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    return { ...defaults, ...parsed };
  } catch (error) {
    return defaults;
  }
};

export const saveSceneConfig = (storageKey, value) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch (error) {
    // Ignore storage quota and serialization issues for scene preferences.
  }
};
