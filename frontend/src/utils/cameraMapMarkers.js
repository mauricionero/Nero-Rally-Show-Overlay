import { parseLatLongString } from './pilotMapMarkers.js';

export const buildCameraMapMarkers = (cameras = [], currentPlacemarkId = '') => {
  const normalizedPlacemarkId = String(currentPlacemarkId || '').trim();

  return cameras
    .filter((camera) => {
      if (!normalizedPlacemarkId) {
        return false;
      }

      const streamUrl = String(camera?.streamUrl || '').trim();
      return String(camera?.mapPlacemarkId || '').trim() === normalizedPlacemarkId && Boolean(streamUrl);
    })
    .map((camera) => {
      const directCoordinates = parseLatLongString(camera?.latLong || '');
      const fallbackPoint = camera?.closestPlacemarkPoint;
      const fallbackCoordinates = (
        Number.isFinite(fallbackPoint?.lat) && Number.isFinite(fallbackPoint?.lng)
      ) ? {
        lat: fallbackPoint.lat,
        lng: fallbackPoint.lng
      } : null;
      const coordinates = directCoordinates || fallbackCoordinates;

      if (!coordinates) {
        return null;
      }

      return {
        id: String(camera?.id || '').trim(),
        name: String(camera?.name || '').trim(),
        lat: coordinates.lat,
        lng: coordinates.lng,
        color: '#FF4500',
        streamUrl: String(camera?.streamUrl || '').trim(),
        isActive: camera?.isActive !== false
      };
    })
    .filter(Boolean);
};
