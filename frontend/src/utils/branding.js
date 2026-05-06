const getBasePath = () => String(process.env.PUBLIC_URL || '').replace(/\/$/, '');

export const DEFAULT_BRANDING_LOGO_URL = `${getBasePath()}/images/nrs-control-zone-logo.png`;

export const getResolvedBrandingLogoUrl = (logoUrl) => {
  const trimmed = typeof logoUrl === 'string' ? logoUrl.trim() : '';

  if (!trimmed) {
    return DEFAULT_BRANDING_LOGO_URL;
  }

  if (trimmed.startsWith('/')) {
    return `${getBasePath()}${trimmed}`;
  }

  return trimmed;
};
