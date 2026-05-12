import React, { useMemo, useState } from 'react';
import { resolvePublicAssetUrl } from '../utils/overlayUrls.js';
import { getPilotCarBrandInfo } from '../utils/carBrand.js';

export function CarBrandBadge({
  carName = '',
  iconOnly = false,
  fallbackToText = true,
  className = ''
}) {
  const rawCarName = String(carName || '').trim();
  const brandInfo = useMemo(() => getPilotCarBrandInfo(rawCarName), [rawCarName]);
  const [iconFailed, setIconFailed] = useState(false);

  if (!rawCarName) {
    return null;
  }

  const iconSrc = !iconFailed && brandInfo?.iconBaseName
    ? resolvePublicAssetUrl(`/images/car_brands/${brandInfo.iconBaseName}-16.png`)
    : '';
  const iconSrcSet = !iconFailed && brandInfo?.iconBaseName
    ? [
        `${resolvePublicAssetUrl(`/images/car_brands/${brandInfo.iconBaseName}-16.png`)} 1x`,
        `${resolvePublicAssetUrl(`/images/car_brands/${brandInfo.iconBaseName}-64.png`)} 4x`,
        `${resolvePublicAssetUrl(`/images/car_brands/${brandInfo.iconBaseName}-128.png`)} 8x`,
        `${resolvePublicAssetUrl(`/images/car_brands/${brandInfo.iconBaseName}-1024.png`)} 64x`
      ].join(', ')
    : '';
  const hasIcon = Boolean(iconSrc);
  const displayText = hasIcon ? (brandInfo?.displayText || rawCarName) : rawCarName;

  if (iconOnly) {
    if (!hasIcon) {
      return fallbackToText ? (
        <span className={`inline-flex min-w-0 items-center gap-1 align-middle ${className}`.trim()}>
          <span className="min-w-0 truncate">
            {rawCarName}
          </span>
        </span>
      ) : null;
    }

    return (
      <img
        src={iconSrc}
        srcSet={iconSrcSet || undefined}
        sizes="16px"
        alt=""
        aria-hidden="true"
        className={`h-4 w-4 flex-none object-contain ${className}`.trim()}
        loading="lazy"
        onError={() => setIconFailed(true)}
      />
    );
  }

  return (
    <span className={`inline-flex min-w-0 items-center gap-1 align-middle ${className}`.trim()}>
      {hasIcon && (
        <img
          src={iconSrc}
          srcSet={iconSrcSet || undefined}
          sizes="16px"
          alt=""
          aria-hidden="true"
          className="h-4 w-4 flex-none object-contain"
          loading="lazy"
          onError={() => setIconFailed(true)}
        />
      )}
      <span className="min-w-0 truncate">
        {displayText}
      </span>
    </span>
  );
}

export default CarBrandBadge;
