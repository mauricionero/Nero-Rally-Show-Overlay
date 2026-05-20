import { normalizeLatLongString, parseLatLongString } from './pilotMapMarkers.js';

const EARTH_RADIUS_KM = 6371;

const toRadians = (value) => (value * Math.PI) / 180;

const haversineDistanceKm = (left, right) => {
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLng = toRadians(right.lng - left.lng);
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);

  const a = (
    (Math.sin(deltaLat / 2) ** 2)
    + (Math.cos(leftLat) * Math.cos(rightLat) * (Math.sin(deltaLng / 2) ** 2))
  );

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
};

const flattenPlacemarkPoints = (placemark) => (
  (placemark?.coordinateGroups || []).flatMap((group, groupIndex) => (
    (group || [])
      .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
      .map((point, pointIndex) => ({
        lat: point.lat,
        lng: point.lng,
        groupIndex,
        pointIndex
      }))
  ))
);

export const resolveCameraPlacemarkLink = ({
  mapPlacemarkId = '',
  latLong = '',
  mapPlacemarks = []
}) => {
  const normalizedPlacemarkId = String(mapPlacemarkId || '').trim();
  const normalizedLatLong = normalizeLatLongString(latLong || '');
  const coordinates = parseLatLongString(normalizedLatLong);

  if (!normalizedPlacemarkId || !coordinates) {
    return {
      mapPlacemarkId: normalizedPlacemarkId,
      latLong: normalizedLatLong,
      closestPlacemarkPoint: null
    };
  }

  const placemark = mapPlacemarks.find((item) => String(item?.id || '').trim() === normalizedPlacemarkId);
  if (!placemark) {
    return {
      mapPlacemarkId: normalizedPlacemarkId,
      latLong: normalizedLatLong,
      closestPlacemarkPoint: null
    };
  }

  const closestPoint = flattenPlacemarkPoints(placemark).reduce((bestMatch, point) => {
    const distanceKm = haversineDistanceKm(coordinates, point);

    if (!bestMatch || distanceKm < bestMatch.distanceKm) {
      return {
        ...point,
        distanceKm
      };
    }

    return bestMatch;
  }, null);

  return {
    mapPlacemarkId: normalizedPlacemarkId,
    latLong: normalizedLatLong,
    closestPlacemarkPoint: closestPoint ? {
      lat: Number(closestPoint.lat.toFixed(6)),
      lng: Number(closestPoint.lng.toFixed(6)),
      groupIndex: closestPoint.groupIndex,
      pointIndex: closestPoint.pointIndex,
      distanceKm: Number(closestPoint.distanceKm.toFixed(4))
    } : null
  };
};
