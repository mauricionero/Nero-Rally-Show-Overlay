const parseCoordinateList = (text) => {
  if (!text) {
    return [];
  }

  return text
    .trim()
    .split(/\s+/)
    .map((entry) => {
      const [lng, lat, alt] = entry.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      return {
        lat,
        lng,
        alt: Number.isFinite(alt) ? alt : null
      };
    })
    .filter(Boolean);
};

const getNodeText = (element, selector) => {
  const node = element.querySelector(selector);
  return node?.textContent?.trim() || '';
};

const getFallbackPlacemarkName = (documentName, fileName) => {
  const trimmedDocumentName = String(documentName || '').trim();
  if (trimmedDocumentName) {
    return trimmedDocumentName;
  }

  const trimmedFileName = String(fileName || '').trim();
  if (trimmedFileName) {
    return trimmedFileName.replace(/\.[^.]+$/, '') || trimmedFileName;
  }

  return 'Combined Points Map';
};

const createPlacemarkId = (prefix, index) => (
  `${prefix}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`
);

export const parseKmlPlacemarks = (kmlText, options = {}) => {
  const {
    importAllAsOneMap = false,
    fileName = ''
  } = options;

  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return { placemarks: [], error: 'DOMParser is not available in this environment.' };
  }

  const parser = new window.DOMParser();
  const xml = parser.parseFromString(kmlText, 'application/xml');
  const parserError = xml.querySelector('parsererror');
  const documentName = getNodeText(xml, 'Document > name');

  if (parserError) {
    return { placemarks: [], error: 'Invalid KML file.' };
  }

  const placemarkNodes = Array.from(xml.querySelectorAll('Placemark'));
  const parsedPlacemarks = placemarkNodes.map((placemarkNode, index) => {
    const name = getNodeText(placemarkNode, 'name') || `Placemark ${index + 1}`;
    const polygonNodes = Array.from(placemarkNode.querySelectorAll('Polygon coordinates'));
    const lineNodes = Array.from(placemarkNode.querySelectorAll('LineString coordinates'));
    const pointNodes = Array.from(placemarkNode.querySelectorAll('Point coordinates'));

    let geometryType = '';
    let coordinateGroups = [];

    if (polygonNodes.length > 0) {
      geometryType = 'polygon';
      coordinateGroups = polygonNodes
        .map((node) => parseCoordinateList(node.textContent || ''))
        .filter((group) => group.length > 0);
    } else if (lineNodes.length > 0) {
      geometryType = 'line';
      coordinateGroups = lineNodes
        .map((node) => parseCoordinateList(node.textContent || ''))
        .filter((group) => group.length > 0);
    } else if (pointNodes.length > 0) {
      geometryType = 'point';
      coordinateGroups = pointNodes
        .map((node) => parseCoordinateList(node.textContent || ''))
        .filter((group) => group.length > 0);
    }

    return {
      sourceIndex: index,
      id: createPlacemarkId('placemark', index),
      name,
      geometryType,
      coordinateGroups
    };
  }).filter((placemark) => placemark.geometryType && placemark.coordinateGroups.length > 0);

  if (importAllAsOneMap) {
    const pointPlacemarks = parsedPlacemarks.filter((placemark) => placemark.geometryType === 'point');

    if (pointPlacemarks.length > 0) {
      const mergedCoordinates = pointPlacemarks.flatMap((placemark) => placemark.coordinateGroups.flat());

      return {
        placemarks: [{
          id: createPlacemarkId('placemark_points', pointPlacemarks[0].sourceIndex),
          name: getFallbackPlacemarkName(documentName, fileName),
          geometryType: 'line',
          coordinateGroups: mergedCoordinates.length > 0 ? [mergedCoordinates] : []
        }],
        error: null
      };
    }
  }

  return {
    placemarks: parsedPlacemarks.map(({ sourceIndex, ...placemark }) => placemark),
    error: null
  };
};
