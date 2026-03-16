import { Map, Globe, Video, Timer, Gauge, Flag, Trophy, Radio, Route } from 'lucide-react';

export const EXTERNAL_MEDIA_ICON_OPTIONS = [
  { value: 'Map', label: 'Map' },
  { value: 'Globe', label: 'Globe' },
  { value: 'Video', label: 'Video' },
  { value: 'Timer', label: 'Timer' },
  { value: 'Gauge', label: 'Speed' },
  { value: 'Flag', label: 'Flag' },
  { value: 'Trophy', label: 'Results' },
  { value: 'Radio', label: 'Radio' },
  { value: 'Route', label: 'Route' }
];

export const getExternalMediaIconComponent = (iconName) => {
  switch (iconName) {
    case 'Globe':
      return Globe;
    case 'Video':
      return Video;
    case 'Timer':
      return Timer;
    case 'Gauge':
      return Gauge;
    case 'Flag':
      return Flag;
    case 'Trophy':
      return Trophy;
    case 'Radio':
      return Radio;
    case 'Route':
      return Route;
    case 'Map':
    default:
      return Map;
  }
};
