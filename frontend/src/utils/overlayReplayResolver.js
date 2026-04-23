const parseYouTubeStartSeconds = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return 0;
  }

  if (/^\d+$/.test(rawValue)) {
    return Number(rawValue);
  }

  const hours = Number((rawValue.match(/(\d+)h/i) || [])[1] || 0);
  const minutes = Number((rawValue.match(/(\d+)m/i) || [])[1] || 0);
  const seconds = Number((rawValue.match(/(\d+)s/i) || [])[1] || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
};

export const getReplayVideoId = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  try {
    const url = new URL(rawValue);
    const host = url.hostname.toLowerCase();

    if (host.includes('youtu.be')) {
      return url.pathname.replace(/^\/+/, '').split('/')[0] || '';
    }

    if (url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/embed/')[1]?.split('/')[0] || '';
    }

    if (url.pathname.startsWith('/live/')) {
      return url.pathname.split('/live/')[1]?.split('/')[0] || '';
    }

    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      return url.searchParams.get('v') || '';
    }
  } catch {
    return '';
  }

  return '';
};

export const parseReplayTimestampToSeconds = (value) => {
  const parts = String(value || '').trim().split(':').map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }

  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }

  return null;
};

export const buildReplayEmbedUrl = (value, startSeconds = null) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  try {
    const url = new URL(rawValue);
    const host = url.hostname.toLowerCase();

    if (host.includes('youtu.be') || host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const videoId = getReplayVideoId(rawValue);
      if (!videoId) {
        return rawValue;
      }

      const resolvedStartSeconds = Number.isFinite(startSeconds)
        ? Math.max(0, Math.trunc(startSeconds))
        : parseYouTubeStartSeconds(url.searchParams.get('t') || url.searchParams.get('start'));
      const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
      embedUrl.searchParams.set('rel', '0');

      if (resolvedStartSeconds > 0) {
        embedUrl.searchParams.set('start', String(resolvedStartSeconds));
      }

      return embedUrl.toString();
    }

    return rawValue;
  } catch {
    return rawValue;
  }
};

export const getPilotEffectiveStageId = (pilot = {}, globalCurrentStageId = null) => {
  const pilotStageId = String(pilot?.currentStageId || '').trim();
  const fallbackStageId = String(globalCurrentStageId || '').trim();
  return pilotStageId || fallbackStageId || null;
};

export const getPilotReplayStartSeconds = (pilot = {}, stageId = null) => {
  const normalizedStageId = String(stageId || '').trim();
  if (!normalizedStageId) {
    return null;
  }

  return parseReplayTimestampToSeconds(pilot?.replayStageTimes?.[normalizedStageId] || '');
};

export const resolvePilotOverlayPlayback = ({
  pilot = {},
  globalCurrentStageId = null,
  eventIsOver = false
} = {}) => {
  const liveStreamUrl = String(pilot?.streamUrl || '').trim();
  const replayVideoUrl = String(pilot?.replayVideoUrl || '').trim();
  const effectiveStageId = getPilotEffectiveStageId(pilot, globalCurrentStageId);
  const replayStartSeconds = getPilotReplayStartSeconds(pilot, effectiveStageId);

  if (eventIsOver && replayVideoUrl) {
    const streamUrl = buildReplayEmbedUrl(replayVideoUrl, replayStartSeconds);
    return {
      mode: 'replay',
      streamUrl,
      hasVideo: Boolean(streamUrl),
      baseUrl: replayVideoUrl,
      effectiveStageId,
      replayStartSeconds
    };
  }

  return {
    mode: 'live',
    streamUrl: liveStreamUrl,
    hasVideo: Boolean(liveStreamUrl),
    baseUrl: liveStreamUrl,
    effectiveStageId,
    replayStartSeconds: null
  };
};

export const buildPilotOverlayPlaybackMap = ({
  pilots = [],
  globalCurrentStageId = null,
  eventIsOver = false
} = {}) => (
  new Map(
    (Array.isArray(pilots) ? pilots : []).map((pilot) => [
      pilot.id,
      resolvePilotOverlayPlayback({
        pilot,
        globalCurrentStageId,
        eventIsOver
      })
    ])
  )
);
