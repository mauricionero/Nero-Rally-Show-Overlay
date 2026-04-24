import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const hasPositionUtility = (className = '') => (
  /\b(static|fixed|absolute|relative|sticky)\b/.test(String(className || ''))
);

export const StreamPlayer = ({ 
  pilotId, 
  streamUrl, 
  name, 
  className = '', 
  showControls = false,
  interactive = false,
  showMuteIndicator = true, // Show/hide the mute icon
  forceUnmute = false, // Force unmute (for inline expanded streams)
  forceMute = false, // Force mute (for small preview streams)
  forceFullscreen = false,
  replayMountIdentity = '',
  resolveStreamUrlOnMount = null
}) => {
  const { getStreamConfig, streamConfigs, globalAudio } = useRally();
  const iframeRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const effectiveVolumeRef = useRef(0);
  const isEffectivelyMutedRef = useRef(false);
  const resolveStreamUrlOnMountRef = useRef(resolveStreamUrlOnMount);
  
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
  effectiveVolumeRef.current = effectiveVolume;
  isEffectivelyMutedRef.current = isEffectivelyMuted;
  
  // Build CSS filter string for video adjustments
  const filterStyle = {
    filter: `saturate(${config.saturation}%) contrast(${config.contrast}%) brightness(${config.brightness}%)`
  };
  const [mountedResolvedStreamUrl, setMountedResolvedStreamUrl] = useState(() => {
    if (typeof resolveStreamUrlOnMount !== 'function') {
      return '';
    }

    try {
      return resolveStreamUrlOnMount() || streamUrl || '';
    } catch {
      return streamUrl || '';
    }
  });
  const effectiveStreamUrl = mountedResolvedStreamUrl || streamUrl;
  const streamProvider = useMemo(() => getStreamProvider(effectiveStreamUrl), [effectiveStreamUrl]);
  const supportsVdoIframeApi = streamProvider === 'vdo';
  const supportsYouTubeIframeApi = streamProvider === 'youtube';
  const positionClassName = hasPositionUtility(className) ? '' : 'relative';
  const shouldAllowPointerEvents = interactive || showControls;

  useEffect(() => {
    resolveStreamUrlOnMountRef.current = resolveStreamUrlOnMount;
  }, [resolveStreamUrlOnMount]);

  useEffect(() => {
    if (!replayMountIdentity || typeof resolveStreamUrlOnMountRef.current !== 'function') {
      setMountedResolvedStreamUrl('');
      return;
    }

    try {
      setMountedResolvedStreamUrl(resolveStreamUrlOnMountRef.current() || streamUrl || '');
    } catch {
      setMountedResolvedStreamUrl(streamUrl || '');
    }
  }, [replayMountIdentity, streamUrl]);

  const iframeSrc = useMemo(() => {
    if (!effectiveStreamUrl) {
      return '';
    }

    try {
      const url = new URL(effectiveStreamUrl);

      if (supportsVdoIframeApi) {
        url.searchParams.set('cleanoutput', '1');
        url.searchParams.set('cleanviewer', '1');

        if (forceFullscreen) {
          url.searchParams.set('cover', '2');
        }

        if (!showControls) {
          url.searchParams.set('nomouseevents', '1');
          url.searchParams.set('nocursor', '1');
        }
      }

      if (supportsYouTubeIframeApi) {
        url.searchParams.set('enablejsapi', '1');

        if (typeof window !== 'undefined' && window.location?.origin) {
          url.searchParams.set('origin', window.location.origin);
        }
      }

      return url.toString();
    } catch {
      return effectiveStreamUrl;
    }
  }, [effectiveStreamUrl, forceFullscreen, showControls, supportsVdoIframeApi, supportsYouTubeIframeApi]);
  const shouldAutoplay = useMemo(() => {
    try {
      return new URL(iframeSrc).searchParams.get('autoplay') === '1';
    } catch {
      return false;
    }
  }, [iframeSrc]);

  useEffect(() => {
    if (!supportsYouTubeIframeApi || !effectiveStreamUrl || !iframeRef.current) {
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

              if (isEffectivelyMutedRef.current) {
                youtubePlayerRef.current.mute();
              } else {
                youtubePlayerRef.current.unMute();
                youtubePlayerRef.current.setVolume(effectiveVolumeRef.current);
              }

              if (shouldAutoplay) {
                try {
                  youtubePlayerRef.current.playVideo();
                } catch {
                  // Ignore autoplay failures; user interaction can still start playback.
                }
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
  }, [effectiveStreamUrl, shouldAutoplay, supportsYouTubeIframeApi]);

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

    if (!supportsVdoIframeApi || !effectiveStreamUrl) {
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
  }, [effectiveStreamUrl, isEffectivelyMuted, effectiveVolume, supportsVdoIframeApi, supportsYouTubeIframeApi]);

  if (!effectiveStreamUrl) {
    return (
      <div className={`bg-zinc-800 flex items-center justify-center ${className}`}>
        <span className="text-lg font-bold text-zinc-600">
          {name?.charAt(0) || '?'}
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-black ${positionClassName} overflow-hidden ${className}`.trim()} style={filterStyle}>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        className="w-full h-full"
        frameBorder="0"
        allow="autoplay; fullscreen; picture-in-picture"
        title={name}
        style={{ pointerEvents: shouldAllowPointerEvents ? 'auto' : 'none' }}
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
