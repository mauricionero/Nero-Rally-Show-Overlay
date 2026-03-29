const clonePoint = (point) => ({
  lat: Number(point.lat),
  lng: Number(point.lng),
  alt: Number.isFinite(point.alt) ? point.alt : null
});

const isValidPoint = (point) => (
  point
  && Number.isFinite(point.lat)
  && Number.isFinite(point.lng)
);

const pointsAlmostEqual = (a, b, epsilon = 1e-12) => (
  Math.abs(a.lat - b.lat) <= epsilon
  && Math.abs(a.lng - b.lng) <= epsilon
);

const perpendicularDistance = (point, start, end) => {
  const x0 = point.lng;
  const y0 = point.lat;
  const x1 = start.lng;
  const y1 = start.lat;
  const x2 = end.lng;
  const y2 = end.lat;

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    const xDiff = x0 - x1;
    const yDiff = y0 - y1;
    return Math.sqrt((xDiff * xDiff) + (yDiff * yDiff));
  }

  const numerator = Math.abs((dy * x0) - (dx * y0) + (x2 * y1) - (y2 * x1));
  const denominator = Math.sqrt((dx * dx) + (dy * dy));
  return denominator === 0 ? 0 : numerator / denominator;
};

const simplifyOpenPath = (points, tolerance) => {
  if (!Array.isArray(points) || points.length <= 2) {
    return (points || []).map(clonePoint).filter(isValidPoint);
  }

  let maxDistance = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance > tolerance) {
    const left = simplifyOpenPath(points.slice(0, index + 1), tolerance);
    const right = simplifyOpenPath(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [clonePoint(points[0]), clonePoint(points[points.length - 1])];
};

const simplifyCoordinateGroup = (group = [], tolerance = 0.00001, geometryType = '') => {
  const validPoints = (Array.isArray(group) ? group : []).filter(isValidPoint).map(clonePoint);

  if (validPoints.length <= 2 || geometryType === 'point') {
    return validPoints;
  }

  const isClosedRing = geometryType === 'polygon' && validPoints.length > 3 && pointsAlmostEqual(validPoints[0], validPoints[validPoints.length - 1]);
  const workPoints = isClosedRing ? validPoints.slice(0, -1) : validPoints;
  const simplified = simplifyOpenPath(workPoints, tolerance);

  if (isClosedRing) {
    if (simplified.length < 3) {
      return validPoints;
    }

    const closed = simplified.map(clonePoint);
    if (!pointsAlmostEqual(closed[0], closed[closed.length - 1])) {
      closed.push(clonePoint(closed[0]));
    }
    return closed;
  }

  return simplified;
};

export const compressMapPlacemarkForTransport = (placemark, {
  maxBytes = 55000,
  initialTolerance = 0.00001,
  maxTolerance = 0.05
} = {}) => {
  if (!placemark || typeof placemark !== 'object') {
    return placemark;
  }

  const sourceGroups = Array.isArray(placemark.coordinateGroups) ? placemark.coordinateGroups : [];
  if (sourceGroups.length === 0) {
    return placemark;
  }

  const createCandidate = (tolerance) => ({
    ...placemark,
    coordinateGroups: sourceGroups.map((group) => simplifyCoordinateGroup(group, tolerance, placemark.geometryType)).filter((group) => group.length > 0)
  });

  const originalSize = JSON.stringify(placemark).length;
  if (originalSize <= maxBytes) {
    return placemark;
  }

  let tolerance = initialTolerance;
  let bestCandidate = createCandidate(tolerance);

  while (tolerance <= maxTolerance) {
    const candidate = createCandidate(tolerance);
    bestCandidate = candidate;

    if (JSON.stringify(candidate).length <= maxBytes) {
      return candidate;
    }

    tolerance *= 2;
  }

  return bestCandidate;
};
