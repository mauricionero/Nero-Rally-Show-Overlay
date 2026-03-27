export const DEFAULT_BRANDING_LOGO_URL = '/images/nrs-control-zone-logo.png';

export const getResolvedBrandingLogoUrl = (logoUrl) => {
  const trimmed = typeof logoUrl === 'string' ? logoUrl.trim() : '';
  return trimmed || DEFAULT_BRANDING_LOGO_URL;
};
