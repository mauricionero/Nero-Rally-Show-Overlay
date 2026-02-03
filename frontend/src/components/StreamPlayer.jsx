import React, { useEffect, useRef } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';

export const StreamPlayer = ({ 
  pilotId, 
  streamUrl, 
  name, 
  className = '', 
  showControls = false,
  size = 'normal' // 'small', 'normal', 'large'
}) => {
  const { getStreamConfig, streamConfigs } = useRally();
  const iframeRef = useRef(null);
  
  // Get the current stream config
  const config = getStreamConfig(pilotId);
  
  // Check if any other stream is solo'd
  const hasSoloStream = Object.values(streamConfigs).some(c => c?.solo);
  const isEffectivelyMuted = config.muted || (hasSoloStream && !config.solo);
  
  // Build CSS filter string for video adjustments
  const filterStyle = {
    filter: `saturate(${config.saturation}%) contrast(${config.contrast}%) brightness(${config.brightness}%)`
  };

  if (!streamUrl) {
    return (
      <div className={`bg-zinc-800 flex items-center justify-center ${className}`}>
        <span className="text-lg font-bold text-zinc-600">
          {name?.charAt(0) || '?'}
        </span>
      </div>
    );
  }

  // VDO.Ninja URL params for audio control
  const urlWithParams = new URL(streamUrl);
  if (isEffectivelyMuted) {
    urlWithParams.searchParams.set('muted', '1');
  }
  // Volume: VDO.Ninja uses 'volume' param (0-100)
  if (!isEffectivelyMuted) {
    urlWithParams.searchParams.set('volume', config.volume.toString());
  }

  return (
    <div className={`bg-black relative overflow-hidden ${className}`} style={filterStyle}>
      <iframe
        ref={iframeRef}
        src={urlWithParams.toString()}
        className="w-full h-full"
        frameBorder="0"
        allow="autoplay"
        title={name}
        style={{ pointerEvents: showControls ? 'auto' : 'none' }}
      />
      {isEffectivelyMuted && (
        <div className="absolute bottom-1 right-1 bg-black/70 px-1 rounded text-xs text-red-500 font-bold">
          🔇
        </div>
      )}
    </div>
  );
};
