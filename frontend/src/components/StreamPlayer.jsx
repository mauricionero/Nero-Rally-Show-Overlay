import React, { useRef } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';

export const StreamPlayer = ({ 
  pilotId, 
  streamUrl, 
  name, 
  className = '', 
  showControls = false,
  showMeter = false, // Show VDO.Ninja built-in audio meter
  showMuteIndicator = true, // Show/hide the mute icon
  forceUnmute = false, // Force unmute (for inline expanded streams)
  forceMute = false, // Force mute (for small preview streams)
  size = 'normal' // 'small', 'normal', 'large'
}) => {
  const { getStreamConfig, streamConfigs, globalAudio } = useRally();
  const iframeRef = useRef(null);
  
  // Get the current stream config
  const config = getStreamConfig(pilotId);
  
  // Check if any other stream is solo'd
  const hasSoloStream = Object.values(streamConfigs).some(c => c?.solo);
  
  // Calculate mute state
  let isEffectivelyMuted = config.muted || globalAudio.muted || (hasSoloStream && !config.solo);
  if (forceUnmute) isEffectivelyMuted = false;
  if (forceMute) isEffectivelyMuted = true;
  
  // Calculate effective volume (individual * global)
  const effectiveVolume = Math.round((config.volume / 100) * (globalAudio.volume / 100) * 100);
  
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
  let urlWithParams;
  try {
    urlWithParams = new URL(streamUrl);
  } catch {
    // If URL is invalid, use as-is
    urlWithParams = { toString: () => streamUrl, searchParams: { set: () => {} } };
  }
  
  if (isEffectivelyMuted) {
    urlWithParams.searchParams.set('muted', '1');
    urlWithParams.searchParams.set('volume', '0');
  } else {
    // Volume: VDO.Ninja uses 'volume' param (0-100)
    urlWithParams.searchParams.set('volume', effectiveVolume.toString());
  }
  
  // Add meter parameter for audio visualization (VDO.Ninja feature)
  if (showMeter) {
    urlWithParams.searchParams.set('meter', '1');
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
      {isEffectivelyMuted && showMuteIndicator && (
        <div className="absolute bottom-1 right-1 bg-black/70 px-1 rounded text-xs text-red-500 font-bold">
          🔇
        </div>
      )}
    </div>
  );
};
