import React, { useEffect, useMemo, useRef } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';

let youtubeApiPromise = null;

const loadYouTubeIframeApi = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube API requires a browser environment.'));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-youtube-iframe-api="true"]');

    const handleReady = () => {
      if (window.YT?.Player) {
        resolve(window.YT);
      }
    };

    const previousHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousHandler?.();
      handleReady();
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeIframeApi = 'true';
      script.onerror = () => reject(new Error('Failed to load the YouTube IFrame API.'));
      document.head.appendChild(script);
    } else {
      handleReady();
    }
  });

  return youtubeApiPromise;
};

const getStreamProvider = (streamUrl) => {
  if (!streamUrl) {
    return 'unknown';
  }

  try {
    const { hostname } = new URL(streamUrl);
    const normalizedHost = hostname.toLowerCase();

    if (normalizedHost.endsWith('vdo.ninja') || normalizedHost.endsWith('obs.ninja')) {
      return 'vdo';
    }

    if (
      normalizedHost.includes('youtube.com')
      || normalizedHost.includes('youtu.be')
      || normalizedHost.includes('youtube-nocookie.com')
    ) {
      return 'youtube';
    }
  } catch {
    return 'unknown';
  }

  return 'generic';
};

const normalizeLoudnessValue = (value) => {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (value <= 0) {
    return Math.max(0, Math.min(1, (value + 80) / 80));
  }

  if (value <= 1) {
    return value;
  }

  if (value <= 100) {
    return value / 100;
  }

  return Math.max(0, Math.min(1, value / 255));
};

const collectNumericValues = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap(collectNumericValues);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectNumericValues);
  }

  return Number.isFinite(value) ? [value] : [];
};

const extractLoudnessLevels = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const leftCandidates = [
    payload.left,
    payload.l,
    payload.leftLevel,
    payload.leftRms,
    payload.leftPeak
  ];
  const rightCandidates = [
    payload.right,
    payload.r,
    payload.rightLevel,
    payload.rightRms,
    payload.rightPeak
  ];

  const left = leftCandidates.map(normalizeLoudnessValue).find((value) => value !== null);
  const right = rightCandidates.map(normalizeLoudnessValue).find((value) => value !== null);

  if (left !== undefined && left !== null && right !== undefined && right !== null) {
    return { left, right };
  }

  const fallbackValues = collectNumericValues(payload)
    .map(normalizeLoudnessValue)
    .filter((value) => value !== null);

  if (fallbackValues.length === 0) {
    return null;
  }

  const averageLevel = fallbackValues.reduce((sum, value) => sum + value, 0) / fallbackValues.length;
  return { left: averageLevel, right: averageLevel };
};

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
  size = 'normal', // 'small', 'normal', 'large'
  onAudioLevelsChange = null
}) => {
  const { getStreamConfig, streamConfigs, globalAudio } = useRally();
  const iframeRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  
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
  const streamProvider = useMemo(() => getStreamProvider(streamUrl), [streamUrl]);
  const supportsVdoIframeApi = streamProvider === 'vdo';
  const supportsYouTubeIframeApi = streamProvider === 'youtube';

  const iframeSrc = useMemo(() => {
    if (!streamUrl) {
      return '';
    }

    try {
      const url = new URL(streamUrl);

      if (supportsYouTubeIframeApi) {
        url.searchParams.set('enablejsapi', '1');

        if (typeof window !== 'undefined' && window.location?.origin) {
          url.searchParams.set('origin', window.location.origin);
        }
      }

      if (supportsVdoIframeApi && showMeter) {
        url.searchParams.set('meter', '1');
      }

      if (supportsVdoIframeApi && onAudioLevelsChange) {
        url.searchParams.set('pushloudness', '1');
      }

      return url.toString();
    } catch {
      return streamUrl;
    }
  }, [streamUrl, showMeter, onAudioLevelsChange, supportsVdoIframeApi, supportsYouTubeIframeApi]);

  useEffect(() => {
    if (!supportsVdoIframeApi || !onAudioLevelsChange || !streamUrl) {
      return undefined;
    }

    const handleMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data?.action !== 'loudness' || !event.data.loudness) {
        return;
      }

      const nextLevels = extractLoudnessLevels(event.data.loudness);
      if (nextLevels) {
        onAudioLevelsChange(nextLevels);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAudioLevelsChange, streamUrl, supportsVdoIframeApi]);

  useEffect(() => {
    if (!onAudioLevelsChange) {
      return undefined;
    }

    onAudioLevelsChange(null);

    return () => {
      onAudioLevelsChange(null);
      if (supportsVdoIframeApi) {
        try {
          iframeRef.current?.contentWindow?.postMessage({ getLoudness: false }, '*');
        } catch {
          // Ignore postMessage cleanup failures
        }
      }
    };
  }, [onAudioLevelsChange, streamUrl, supportsVdoIframeApi]);

  useEffect(() => {
    if (!supportsYouTubeIframeApi || !streamUrl || !iframeRef.current) {
      return undefined;
    }

    let cancelled = false;

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !iframeRef.current) {
          return;
        }

        youtubePlayerRef.current = new YT.Player(iframeRef.current, {
          events: {
            onReady: () => {
              if (!youtubePlayerRef.current) {
                return;
              }

              if (isEffectivelyMuted) {
                youtubePlayerRef.current.mute();
              } else {
                youtubePlayerRef.current.unMute();
                youtubePlayerRef.current.setVolume(effectiveVolume);
              }
            }
          }
        });
      })
      .catch(() => {
        youtubePlayerRef.current = null;
      });

    return () => {
      cancelled = true;

      if (youtubePlayerRef.current?.destroy) {
        youtubePlayerRef.current.destroy();
      }

      youtubePlayerRef.current = null;
    };
  }, [supportsYouTubeIframeApi, streamUrl]);

  useEffect(() => {
    if (supportsYouTubeIframeApi) {
      try {
        if (!youtubePlayerRef.current) {
          return undefined;
        }

        if (isEffectivelyMuted) {
          youtubePlayerRef.current.mute();
        } else {
          youtubePlayerRef.current.unMute();
          youtubePlayerRef.current.setVolume(effectiveVolume);
        }
      } catch {
        // Ignore YouTube API control failures while the player is initializing.
      }

      return undefined;
    }

    if (!supportsVdoIframeApi || !streamUrl) {
      return undefined;
    }

    try {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow) {
        return undefined;
      }

      iframeWindow.postMessage({
        mute: isEffectivelyMuted,
        volume: isEffectivelyMuted ? 0 : Math.max(0, Math.min(1, effectiveVolume / 100))
      }, '*');
    } catch {
      // Ignore postMessage failures while the iframe is not ready yet
    }

    return undefined;
  }, [streamUrl, isEffectivelyMuted, effectiveVolume, supportsVdoIframeApi, supportsYouTubeIframeApi]);

  if (!streamUrl) {
    return (
      <div className={`bg-zinc-800 flex items-center justify-center ${className}`}>
        <span className="text-lg font-bold text-zinc-600">
          {name?.charAt(0) || '?'}
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-black relative overflow-hidden ${className}`} style={filterStyle}>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        className="w-full h-full"
        frameBorder="0"
        allow="autoplay"
        title={name}
        style={{ pointerEvents: showControls ? 'auto' : 'none' }}
        onLoad={() => {
          if (supportsYouTubeIframeApi) {
            return;
          }

          if (supportsVdoIframeApi) {
            try {
              iframeRef.current?.contentWindow?.postMessage({
                mute: isEffectivelyMuted,
                volume: isEffectivelyMuted ? 0 : Math.max(0, Math.min(1, effectiveVolume / 100))
              }, '*');
            } catch {
              // Ignore postMessage failures on initial load
            }
          }

          if (!supportsVdoIframeApi || !onAudioLevelsChange) {
            return;
          }

          try {
            iframeRef.current?.contentWindow?.postMessage({ getLoudness: true }, '*');
          } catch {
            // Ignore postMessage failures on initial load
          }
        }}
      />
      {isEffectivelyMuted && showMuteIndicator && (
        <div className="absolute bottom-1 right-1 bg-black/70 px-1 rounded text-xs text-red-500 font-bold">
          🔇
        </div>
      )}
    </div>
  );
};
