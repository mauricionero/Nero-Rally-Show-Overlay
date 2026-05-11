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

export const getMapPlacemarkPointCount = (placemark) => (
  (Array.isArray(placemark?.coordinateGroups) ? placemark.coordinateGroups : [])
    .reduce((total, group) => total + (Array.isArray(group) ? group.length : 0), 0)
);

const normalizeMapPlacemarkName = (name) => (
  String(name || '')
    .trim()
    .replace(/\s*\(-\d+%\)\s*$/u, '')
    .trim()
);

const sampleEvenlySpacedPoints = (points, step, geometryType = '') => {
  if (!Array.isArray(points) || points.length <= 2) {
    return (points || []).map(clonePoint).filter(isValidPoint);
  }

  const normalizedStep = Math.max(2, Math.floor(Number(step) || 2));
  const isClosedRing = geometryType === 'polygon' && points.length > 3 && pointsAlmostEqual(points[0], points[points.length - 1]);
  const workPoints = isClosedRing ? points.slice(0, -1) : points;
  const sampled = [];

  workPoints.forEach((point, index) => {
    if (
      index === 0
      || index === workPoints.length - 1
      || ((index + 1) % normalizedStep !== 0)
    ) {
      sampled.push(clonePoint(point));
    }
  });

  if (sampled.length < 2) {
    return [clonePoint(workPoints[0]), clonePoint(workPoints[workPoints.length - 1])].filter(isValidPoint);
  }

  if (isClosedRing && sampled.length > 0) {
    const closed = sampled.map(clonePoint);
    if (!pointsAlmostEqual(closed[0], closed[closed.length - 1])) {
      closed.push(clonePoint(closed[0]));
    }
    return closed.filter(isValidPoint);
  }

  return sampled.filter(isValidPoint);
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

const downsamplePlacemarkCoordinateGroups = (placemark, maxBytes) => {
  const sourceGroups = Array.isArray(placemark.coordinateGroups) ? placemark.coordinateGroups : [];
  if (sourceGroups.length === 0) {
    return placemark;
  }

  const originalSize = JSON.stringify(placemark).length;
  if (!Number.isFinite(originalSize) || originalSize <= maxBytes) {
    return placemark;
  }

  const targetRatio = Math.min(0.95, Math.max(0.05, maxBytes / originalSize));
  const initialStep = Math.max(2, Math.round(1 / Math.max(0.05, 1 - targetRatio)));
  let bestCandidate = placemark;

  for (let step = initialStep; step <= Math.max(initialStep + 32, 256); step += 1) {
    const candidate = {
      ...placemark,
      coordinateGroups: sourceGroups
        .map((group) => sampleEvenlySpacedPoints(group, step, placemark.geometryType))
        .filter((group) => group.length > 0)
    };

    bestCandidate = candidate;
    if (JSON.stringify(candidate).length <= maxBytes) {
      return candidate;
    }
  }

  return bestCandidate;
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

  const downsampled = downsamplePlacemarkCoordinateGroups(placemark, maxBytes);
  if (JSON.stringify(downsampled).length <= maxBytes) {
    return downsampled;
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

export const prepareMapPlacemarkForImport = (placemark, {
  maxBytes = 55000
} = {}) => {
  if (!placemark || typeof placemark !== 'object') {
    return placemark;
  }

  const originalName = normalizeMapPlacemarkName(placemark.name);
  const originalSize = JSON.stringify(placemark).length;
  const compressedPlacemark = compressMapPlacemarkForTransport(placemark, { maxBytes });
  const compressedSize = JSON.stringify(compressedPlacemark).length;
  const reductionPercent = originalSize > 0
    ? Math.max(0, Math.min(99, Math.round((1 - (compressedSize / originalSize)) * 100)))
    : 0;

  return {
    ...compressedPlacemark,
    name: reductionPercent > 0
      ? `${originalName || compressedPlacemark.name || ''} (-${reductionPercent}%)`
      : (originalName || compressedPlacemark.name || '')
  };
};
