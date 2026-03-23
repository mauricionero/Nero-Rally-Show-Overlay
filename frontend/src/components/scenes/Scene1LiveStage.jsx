import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { StartInformationValue } from '../StartInformationValue.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import StatusPill from '../StatusPill.jsx';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import * as rallyHelpers from '../../utils/rallyHelpers';
import { ChevronLeft, ChevronRight, Flag, Maximize2, Minimize2, RotateCcw, Video } from 'lucide-react';
import { getExternalMediaIconComponent } from '../../utils/mediaIcons.js';
import { loadSceneConfig, saveSceneConfig } from '../../utils/sceneConfigStorage.js';
import { getStageTitle, isLapRaceStageType, isSpecialStageType } from '../../utils/stageTypes.js';

const LAYOUTS = [
  { id: '1', name: '1 Stream', cols: 1, rows: 1, slots: 1 },
  { id: '1x2', name: '1x2 Vertical', cols: 1, rows: 2, slots: 2 },
  { id: '2x1', name: '2x1 Horizontal', cols: 2, rows: 1, slots: 2 },
  { id: '2x2', name: '2x2 Grid', cols: 2, rows: 2, slots: 4 },
  { id: '3x2', name: '3x2 Grid', cols: 3, rows: 2, slots: 6 }
];
const SCENE_1_CONFIG_KEY = 'scene1Config';

const abbreviateTickerName = (name) => {
  if (!name) return '';

  return name
    .split(/\s*\/\s*/)
    .map((part) => {
      const words = part.trim().split(/\s+/).filter(Boolean);

      if (words.length <= 1) {
        return part.trim();
      }

      const firstInitial = words[0][0]?.toUpperCase() || '';
      const lastName = words[words.length - 1];
      return `${firstInitial}. ${lastName}`;
    })
    .join(' / ');
};


// Helper to calculate position for Lap Race based on lap times
const calculateLapRacePositions = (pilots, stageId, lapTimes, stagePilots, numberOfLaps) => {
  const selectedPilotIds = stagePilots[stageId] || pilots.map(p => p.id);
  const selectedPilots = pilots.filter(p => selectedPilotIds.includes(p.id));
  
  const pilotData = selectedPilots.map(pilot => {
    const pilotLaps = lapTimes[pilot.id]?.[stageId] || [];
    const completedLaps = pilotLaps.filter(t => t && t.trim() !== '').length;
    
    // Calculate total time from lap times
    let totalTimeMs = 0;
    pilotLaps.forEach(lapTime => {
      if (!lapTime) return;
      const parts = lapTime.split(':');
      if (parts.length >= 2) {
        const hours = parts.length === 3 ? parseInt(parts[0]) || 0 : 0;
        const mins = parts.length === 3 ? parseInt(parts[1]) || 0 : parseInt(parts[0]) || 0;
        const secsStr = parts.length === 3 ? parts[2] : parts[1];
        const [secs, ms] = (secsStr || '0').split('.');
        totalTimeMs += (hours * 3600 + mins * 60 + parseFloat(secs || 0) + parseFloat(`0.${ms || 0}`)) * 1000;
      }
    });
    
    const isFinished = completedLaps >= numberOfLaps;
    
    return { 
      pilot, 
      completedLaps, 
      totalTimeMs,
      isFinished,
      lastLapTime: pilotLaps[pilotLaps.length - 1] || null
    };
  });

  // Sort: most laps first, then by total time (fastest)
  pilotData.sort((a, b) => {
    if (b.completedLaps !== a.completedLaps) return b.completedLaps - a.completedLaps;
    if (a.completedLaps === 0) return 0;
    return a.totalTimeMs - b.totalTimeMs;
  });

  return pilotData.map((data, index) => ({
    ...data,
    position: index + 1
  }));
};

export default function Scene1LiveStage({ hideStreams = false }) {
  const { 
    pilots, stages, currentStageId, startTimes, realStartTimes, times, categories, 
    chromaKey, logoUrl, lapTimes, stagePilots,
    cameras, externalMedia, debugDate, retiredStages, isStageAlert
  } = useRally();
  const { t } = useTranslation();
  const initialSceneConfig = useMemo(
    () => loadSceneConfig(SCENE_1_CONFIG_KEY, { selectedLayout: '2x2', isExpandedView: false, selectedSlotIds: [] }),
    []
  );
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedLayout, setSelectedLayout] = useState(initialSceneConfig.selectedLayout);
  const [draftSelectedLayout, setDraftSelectedLayout] = useState(initialSceneConfig.selectedLayout);
  const [isExpandedView, setIsExpandedView] = useState(initialSceneConfig.isExpandedView);

  // helper to render an icon for a media item
  const renderIcon = (iconName) => {
    const Icon = getExternalMediaIconComponent(iconName);
    return <Icon className="w-5 h-5 text-[#FF4500]" />;
  };
  const [selectedSlotIds, setSelectedSlotIds] = useState(initialSceneConfig.selectedSlotIds);
  const [draftSelectedSlotIds, setDraftSelectedSlotIds] = useState(initialSceneConfig.selectedSlotIds);
  const [bottomScroll, setBottomScroll] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const bottomContainerRef = useRef(null);
  const bottomTrackRef = useRef(null);
  
  const currentStage = stages.find(s => s.id === currentStageId);
  const activeMedia = externalMedia.filter(m => m.url);
  const isLapRace = isLapRaceStageType(currentStage?.type);
  const isSSStage = isSpecialStageType(currentStage?.type);
  const activeCameras = cameras.filter(c => c.isActive && c.streamUrl);
  const validSlotIds = useMemo(() => new Set([
    ...pilots.filter((pilot) => pilot.isActive && pilot.streamUrl).map((pilot) => pilot.id),
    ...activeCameras.map((camera) => camera.id),
    ...activeMedia.map((media) => `media-${media.id}`)
  ]), [pilots, activeCameras, activeMedia]);
  
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  const layout = LAYOUTS.find(l => l.id === selectedLayout) || LAYOUTS[3];
  const draftLayout = LAYOUTS.find(l => l.id === draftSelectedLayout) || LAYOUTS[3];
  const activePilots = pilots.filter(p => p.isActive && p.streamUrl);
  const sceneNow = useMemo(() => rallyHelpers.getReferenceNow(debugDate, currentTime), [debugDate, currentTime]);
  
  // Calculate sorted pilots based on stage type
  const sortedPilotsWithPositions = useMemo(() => {
    if (!currentStageId || !currentStage) {
      return pilots.map((p, i) => ({ pilot: p, position: i + 1, completedLaps: 0 }));
    }
    
    if (isLapRace) {
      return calculateLapRacePositions(pilots, currentStageId, lapTimes, stagePilots, currentStage.numberOfLaps || 5);
    }
    
    // For SS and other types, use the existing sort
    const sorted = rallyHelpers.sortPilotsByStatus(pilots, categories, currentStageId, startTimes, times, retiredStages, currentStage?.date, sceneNow);
    return sorted.map((pilot, index) => ({ pilot, position: index + 1 }));
  }, [pilots, currentStageId, currentStage, isLapRace, lapTimes, stagePilots, startTimes, times, retiredStages, sceneNow]);

  // Calculate max scroll based on the actual ticker track width
  useEffect(() => {
    const container = bottomContainerRef.current;
    const track = bottomTrackRef.current;

    if (!container || !track) {
      return undefined;
    }

    const updateBottomMetrics = () => {
      const nextMaxScroll = Math.max(0, track.scrollWidth - container.clientWidth);
      setMaxScroll(nextMaxScroll);
      setBottomScroll(prev => Math.min(prev, nextMaxScroll));
    };

    updateBottomMetrics();

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(updateBottomMetrics);
      resizeObserver.observe(container);
      resizeObserver.observe(track);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener('resize', updateBottomMetrics);
    return () => window.removeEventListener('resize', updateBottomMetrics);
  }, [sortedPilotsWithPositions, pilots]);
  
  // Auto-select active pilots up to layout slots
  useEffect(() => {
    if (selectedSlotIds.length === 0 && draftSelectedSlotIds.length === 0 && activePilots.length > 0) {
      const defaultSlotIds = activePilots.slice(0, draftLayout.slots).map((pilot) => pilot.id);
      setSelectedSlotIds(defaultSlotIds);
      setDraftSelectedSlotIds(defaultSlotIds);
    }
  }, [activePilots, draftLayout.slots, selectedSlotIds.length, draftSelectedSlotIds.length]);

  useEffect(() => {
    setSelectedSlotIds((prev) => {
      const next = prev.filter((slotId) => validSlotIds.has(slotId));
      return next.length === prev.length ? prev : next;
    });

    setDraftSelectedSlotIds((prev) => {
      const next = prev.filter((slotId) => validSlotIds.has(slotId));
      return next.length === prev.length ? prev : next;
    });
  }, [validSlotIds]);

  useEffect(() => {
    setSelectedSlotIds((prev) => (prev.length > layout.slots ? prev.slice(0, layout.slots) : prev));
  }, [layout.slots]);

  useEffect(() => {
    setDraftSelectedSlotIds((prev) => (prev.length > draftLayout.slots ? prev.slice(0, draftLayout.slots) : prev));
  }, [draftLayout.slots]);

  useEffect(() => {
    saveSceneConfig(SCENE_1_CONFIG_KEY, {
      selectedLayout,
      isExpandedView,
      selectedSlotIds
    });
  }, [selectedLayout, isExpandedView, selectedSlotIds]);

  const toggleSlot = (slotId) => {
    setDraftSelectedSlotIds(prev => {
      if (prev.includes(slotId)) {
        return prev.filter(id => id !== slotId);
      } else if (prev.length < draftLayout.slots) {
        return [...prev, slotId];
      }
      return prev;
    });
  };

  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (dragIndex === dropIndex) return;

    setDraftSelectedSlotIds(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(dragIndex, 1);
      newOrder.splice(dropIndex, 0, removed);
      return newOrder;
    });
  };

  const hasPendingSelectionChanges = draftSelectedSlotIds.length !== selectedSlotIds.length
    || draftSelectedSlotIds.some((slotId, index) => slotId !== selectedSlotIds[index]);
  const hasPendingLayoutChanges = draftSelectedLayout !== selectedLayout;
  const hasPendingChanges = hasPendingLayoutChanges || hasPendingSelectionChanges;

  const getDisplayItem = (slotId) => {
    // Check if it's a camera
    const camera = cameras.find(c => c.id === slotId);
    if (camera) {
      return { type: 'camera', ...camera };
    }
    // Check external media
    if (slotId.startsWith('media-')) {
      const mid = slotId.replace('media-', '');
      const media = externalMedia.find(m => m.id === mid);
      if (media) return { type: 'media', ...media };
    }
    // Otherwise it's a pilot
    const pilot = pilots.find(p => p.id === slotId);
    return pilot ? { type: 'pilot', ...pilot } : null;
  };

  const displayItems = selectedSlotIds.map(id => getDisplayItem(id)).filter(Boolean);
  const sceneInset = isExpandedView ? '2px' : '2rem';

  const gridStyle = {
    height: currentStage && currentStageId ? 'calc(100% - 230px)' : '100%',
    gap: isExpandedView ? '2px' : '1rem',
    gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`
  };

  // Get pilot position and lap info for Lap Race
  const getPilotLapInfo = (pilotId) => {
    const data = sortedPilotsWithPositions.find(d => d.pilot.id === pilotId);
    if (!data) return null;
    return {
      position: data.position,
      completedLaps: data.completedLaps || 0,
      isFinished: data.isFinished || false,
      totalLaps: currentStage?.numberOfLaps || 0
    };
  };

  const handleBottomTickerWheel = (event) => {
    if (maxScroll <= 0) {
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

    if (!delta) {
      return;
    }

    event.preventDefault();
    setBottomScroll((prev) => Math.max(0, Math.min(maxScroll, prev + delta)));
  };

  // Get stage display name - always show stage name, not event name
  const getStageDisplayName = () => {
    if (!currentStage) return '';

    if (isSSStage) {
      return getStageTitle(currentStage, ' ');
    }

    return currentStage.name;
  };

  const stageScheduleTime = currentStage?.startTime || '';

  return (
    <div className="relative w-full h-full" style={{ padding: sceneInset }} data-testid="scene-1-live-stage">
      <LeftControls>
        <div className="space-y-4">
          <div>
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.cameraSpacing')}</Label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsExpandedView((prev) => !prev)}
              className="w-full justify-start border-zinc-700 bg-[#18181B] text-white hover:bg-zinc-800"
              data-testid="scene1-expand-view-button"
            >
              {isExpandedView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              {isExpandedView ? t('scene1.retractView') : t('scene1.expandView')}
            </Button>
            <p className="mt-2 text-xs text-zinc-500">
              {t('scene1.cameraSpacingHint')}
            </p>
          </div>

          <div>
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.layout')}</Label>
            <Select value={draftSelectedLayout} onValueChange={setDraftSelectedLayout}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAYOUTS.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.selectItems')} ({draftSelectedSlotIds.length}/{draftLayout.slots})</Label>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {/* Camera Options - First priority */}
              {activeCameras.length > 0 && (
                <div className="pb-2 border-b border-zinc-700 mb-2">
                  <div className="text-xs text-zinc-500 uppercase mb-2">{t('streams.additionalCameras')}</div>
                  {activeCameras.map((camera) => (
                    <div key={camera.id} className="flex items-center space-x-2 mb-1">
                      <Checkbox
                        id={`camera-${camera.id}`}
                        checked={draftSelectedSlotIds.includes(camera.id)}
                        onCheckedChange={() => toggleSlot(camera.id)}
                        disabled={!draftSelectedSlotIds.includes(camera.id) && draftSelectedSlotIds.length >= draftLayout.slots}
                      />
                      <label htmlFor={`camera-${camera.id}`} className="text-white text-sm cursor-pointer flex items-center gap-2">
                        <Video className="w-4 h-4 text-[#FF4500]" />
                        {camera.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {/* External Media options - second priority */}
              {activeMedia.length > 0 && (
                <div className="pb-2 border-b border-zinc-700 mb-2">
                  <div className="text-xs text-zinc-500 uppercase mb-2">{t('scene1.externalMedia')}</div>
                  {activeMedia.map((m) => {
                    const slotId = `media-${m.id}`;
                    return (
                      <div key={m.id} className="flex items-center space-x-2 mb-1">
                        <Checkbox
                          id={`media-${m.id}`}
                          checked={draftSelectedSlotIds.includes(slotId)}
                          onCheckedChange={() => toggleSlot(slotId)}
                          disabled={!draftSelectedSlotIds.includes(slotId) && draftSelectedSlotIds.length >= draftLayout.slots}
                        />
                        <label htmlFor={`media-${m.id}`} className="text-white text-sm cursor-pointer flex items-center gap-2">
                          {renderIcon(m.icon)}
                          {m.name}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Pilot Options - Third priority */}
              {activePilots.length > 0 && (
                <div className="text-xs text-zinc-500 uppercase mb-2">{t('tabs.pilots')}</div>
              )}
              {activePilots.map((pilot) => {
                const lapInfo = isLapRace ? getPilotLapInfo(pilot.id) : null;
                return (
                  <div key={pilot.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`pilot-${pilot.id}`}
                      checked={draftSelectedSlotIds.includes(pilot.id)}
                      onCheckedChange={() => toggleSlot(pilot.id)}
                      disabled={!draftSelectedSlotIds.includes(pilot.id) && draftSelectedSlotIds.length >= draftLayout.slots}
                    />
                    <label htmlFor={`pilot-${pilot.id}`} className="text-white text-sm cursor-pointer flex items-center gap-2">
                      {lapInfo && (
                        <span className="text-[#FF4500] font-bold text-xs">P{lapInfo.position}</span>
                      )}
                      {pilot.name}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {draftSelectedSlotIds.length > 0 && (
            <div>
              <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.reorderDragDrop')}</Label>
              <div className="space-y-1">
                {draftSelectedSlotIds.map((slotId, index) => {
                  const camera = cameras.find(c => c.id === slotId);
                  const media = slotId.startsWith('media-')
                    ? externalMedia.find(m => m.id === slotId.replace('media-', ''))
                    : null;
                  const pilot = !camera && !media ? pilots.find(p => p.id === slotId) : null;
                  let label = '';
                  if (media) label = media.name;
                  else if (camera) label = camera.name;
                  else if (pilot) label = pilot.name;
                  const isCamera = !!camera;
                  if (!label) return null;

                  return (
                    <div
                      key={slotId}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      className="bg-[#18181B] border border-zinc-700 p-2 rounded cursor-move hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-xs">{index + 1}.</span>
                        {media && renderIcon(media.icon)}
                        {isCamera && <Video className="w-3 h-3 text-[#FF4500]" />}
                        <span className="text-white text-sm">{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Button
            type="button"
            onClick={() => {
              const nextSelectedSlotIds = draftSelectedSlotIds.slice(0, draftLayout.slots);
              setSelectedLayout(draftSelectedLayout);
              setSelectedSlotIds(nextSelectedSlotIds);
              setDraftSelectedSlotIds(nextSelectedSlotIds);
            }}
            disabled={!hasPendingChanges}
            className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {t('common.apply')}
          </Button>
        </div>
      </LeftControls>

      <div className="grid" style={gridStyle}>
        {displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-full col-span-full">
            <div className="text-center">
              <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {t('scene1.noItemsSelected')}
              </p>
              <p className="text-zinc-400 mt-2">{t('scene1.selectPilotsOrMedia')}</p>
            </div>
          </div>
        ) : (
          displayItems.map((item) => {
            // External media item
            if (item.type === 'media') {
              return (
                <div key={item.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: chromaKey }}>
                  <iframe
                    src={item.url}
                    className="w-full h-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={item.name}
                  />
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                    {renderIcon(item.icon)}
                    <p className="text-white font-bold text-lg uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1)' }}>
                      {item.name}
                    </p>
                  </div>
                </div>
              );
            }

            // Camera Item
            if (item.type === 'camera') {
              return (
                <div key={item.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: chromaKey }}>
                  <StreamPlayer
                    pilotId={item.id}
                    streamUrl={item.streamUrl}
                    name={item.name}
                    className="w-full h-full"
                  />
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                    <div className="flex items-center gap-2">
                      <Video className="w-5 h-5 text-[#FF4500]" />
                      <p className="text-white font-bold text-lg uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1)' }}>
                        {item.name}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            // Pilot Stream Item
            const pilot = item;
            const category = categories.find(c => c.id === pilot.categoryId);
            const lapInfo = isLapRace ? getPilotLapInfo(pilot.id) : null;
            const alert = currentStageId ? isStageAlert(pilot.id, currentStageId) : false;
            const jumpStart = currentStageId ? rallyHelpers.isJumpStartForStage(pilot.id, currentStageId, startTimes, realStartTimes) : false;
            
            let displayTime = '';
            let displayTimeInfo = null;
            let timeColor = 'text-zinc-400';
            let positionBadge = null;
            
            if (isLapRace && lapInfo) {
              // Lap Race display
              positionBadge = (
                <div className="absolute top-2 left-2 bg-black/80 px-2 py-1 rounded flex items-center gap-1">
                  <span className="text-[#FF4500] font-bold text-lg">P{lapInfo.position}</span>
                  <span className="text-zinc-400 text-sm">
                    Lap {lapInfo.completedLaps}/{lapInfo.totalLaps}
                  </span>
                </div>
              );
              if (lapInfo.isFinished) {
                displayTime = 'FINISHED';
                timeColor = 'text-[#22C55E]';
              }
            } else if (isSSStage) {
              // SS Stage display (original logic)
              const timeInfo = rallyHelpers.startInformationTime({
                pilotId: pilot.id,
                stageId: currentStageId,
                startTimes,
                times,
                retiredStages,
                stageDate: currentStage?.date,
                now: sceneNow,
                startLabel: t('status.start'),
                retiredLabel: t('status.retired')
              });
              displayTimeInfo = timeInfo;
              
              if (timeInfo.status === 'retired') {
                displayTime = timeInfo.text;
                timeColor = 'text-red-400';
              } else if (timeInfo.status === 'racing' && timeInfo.timer) {
                displayTime = timeInfo.text;
                timeColor = 'text-[#FF8C00]';
              } else if (timeInfo.status === 'finished' && timeInfo.finishTime) {
                displayTime = timeInfo.text;
                timeColor = timeInfo.retired ? 'text-amber-400' : 'text-[#22C55E]';
              } else if (timeInfo.text) {
                displayTime = timeInfo.text;
                timeColor = 'text-zinc-500';
              }
            }
            
            return (
              <div key={pilot.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: hideStreams ? chromaKey : 'black' }}>
                {category && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 z-10" style={{ backgroundColor: category.color }} />
                )}
                {positionBadge}
                {!hideStreams && (
                  <StreamPlayer
                    pilotId={pilot.id}
                    streamUrl={pilot.streamUrl}
                    name={pilot.name}
                    className="w-full h-full"
                  />
                )}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-white font-bold text-lg uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1), 2px 2px 4px rgba(0,0,0,1), -1px -1px 2px rgba(0,0,0,1)' }}>
                        <span className="text-zinc-400 text-base mr-2" style={{ textShadow: '0 0 6px rgba(0,0,0,1)' }}>#{pilot.startOrder || '?'}</span>
                        {pilot.name}
                      </p>
                      {alert && (
                        <StatusPill
                          variant="alert"
                          text={t('status.alert')}
                          tooltipTitle={t('status.alertLabel')}
                          tooltipText={t('status.alertTooltip')}
                        />
                      )}
                      {jumpStart && (
                        <StatusPill
                          variant="jumpStart"
                          text={t('status.jumpStart')}
                          tooltipTitle={t('times.jumpStart')}
                          tooltipText={t('times.jumpStartTooltip')}
                        />
                      )}
                    </div>
                    {displayTime && (
                      <StartInformationValue
                        as="p"
                        info={displayTimeInfo}
                        fallback={displayTime}
                        className={`font-mono text-lg font-bold ${timeColor}`}
                        style={{ fontFamily: 'JetBrains Mono, monospace', textShadow: '0 0 10px rgba(0,0,0,1), 2px 2px 6px rgba(0,0,0,1), -1px -1px 3px rgba(0,0,0,1)' }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Panel - Current Stage Info */}
      {currentStage && currentStageId && (
        <div className="absolute" style={{ bottom: sceneInset, left: sceneInset, right: sceneInset }}>
          <div className="bg-black/95 backdrop-blur-sm border-l-4 border-[#FF4500] overflow-hidden mb-4">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isLapRace ? (
                  <RotateCcw className="w-6 h-6 text-[#FACC15]" />
                ) : (
                  <Flag className="w-6 h-6 text-[#FF4500]" />
                )}
                <div>
                  <p className="text-zinc-400 text-sm uppercase" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {isLapRace ? 'Race' : 'Current Stage'}
                  </p>
                  <div className="mt-1 flex items-end gap-6">
                    <p className="text-white text-3xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      {getStageDisplayName()}
                    </p>
                    {stageScheduleTime && (
                      <p className="text-zinc-300 text-2xl font-bold font-mono leading-none">
                        {stageScheduleTime}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {logoUrl && (
                <img 
                  src={logoUrl} 
                  alt="Channel Logo" 
                  className="h-16 max-w-[200px] object-contain"
                />
              )}
            </div>
          </div>

          {/* Bottom Ticker - Pilots sorted by position */}
          <div className="relative bg-black/95 backdrop-blur-sm border-t-2 border-[#FF4500]">
            {bottomScroll > 0 && (
              <button
                onClick={() => setBottomScroll(Math.max(0, bottomScroll - 200))}
                className="absolute left-0 top-0 bottom-0 z-10 bg-black/90 hover:bg-black px-2 text-white"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <div className="overflow-hidden px-10" ref={bottomContainerRef} onWheel={handleBottomTickerWheel}>
              <div 
                ref={bottomTrackRef}
                className="flex gap-2 py-2 transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${bottomScroll}px)` }}
              >
                {sortedPilotsWithPositions.map(({ pilot, position, completedLaps, isFinished }) => {
                  const category = categories.find(c => c.id === pilot.categoryId);
                  const pilotMeta = [pilot.car, pilot.team].filter(Boolean).join(' • ');
                  const alert = currentStageId ? isStageAlert(pilot.id, currentStageId) : false;
                  const jumpStart = currentStageId ? rallyHelpers.isJumpStartForStage(pilot.id, currentStageId, startTimes, realStartTimes) : false;
                  
                  let borderColor = 'border-zinc-700';
                  let timeDisplay = '';
                  let timeInfo = null;
                  let timeColor = 'text-zinc-500';
                  
                  if (isLapRace) {
                    if (isFinished) {
                      borderColor = 'border-[#22C55E]';
                      timeDisplay = 'FINISHED';
                      timeColor = 'text-[#22C55E]';
                    } else if (completedLaps > 0) {
                      borderColor = 'border-[#FACC15]';
                      timeDisplay = `Lap ${completedLaps}/${currentStage?.numberOfLaps || 0}`;
                      timeColor = 'text-[#FACC15]';
                    }
                  } else if (isSSStage) {
                    timeInfo = rallyHelpers.startInformationTime({
                      pilotId: pilot.id,
                      stageId: currentStageId,
                      startTimes,
                      times,
                      retiredStages,
                      stageDate: currentStage?.date,
                      now: sceneNow,
                      startLabel: t('status.start'),
                      retiredLabel: t('status.retired')
                    });
                    
                    if (timeInfo.status === 'retired') {
                      borderColor = 'border-red-500';
                      timeDisplay = timeInfo.text;
                      timeColor = 'text-red-400';
                    } else if (timeInfo.status === 'finished' && timeInfo.finishTime) {
                      borderColor = timeInfo.retired ? 'border-amber-400' : 'border-[#22C55E]';
                      timeDisplay = timeInfo.text;
                      timeColor = timeInfo.retired ? 'text-amber-400' : 'text-[#22C55E]';
                    } else if (timeInfo.status === 'racing' && timeInfo.timer) {
                      borderColor = 'border-[#FF8C00]';
                      timeDisplay = timeInfo.text;
                      timeColor = 'text-[#FF8C00]';
                    } else if (timeInfo.text) {
                      timeDisplay = timeInfo.text;
                      timeColor = 'text-zinc-500';
                    }
                  }
                  
                  return (
                    <div 
                      key={pilot.id} 
                      className={`relative flex-shrink-0 w-[170px] bg-white/5 border-2 ${borderColor} px-4 py-2.5 transition-all duration-500 ease-out`}
                      style={{ order: position }}
                    >
                      {category && (
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
                      )}
                      <div className="pl-2 min-w-0">
                        {isLapRace && (
                          <span className="block text-[#FF4500] font-bold text-sm leading-none mb-1">P{position}</span>
                        )}
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-white text-sm font-bold uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              {abbreviateTickerName(pilot.name)}
                            </p>
                            {alert && (
                              <StatusPill
                                variant="alert"
                                text={t('status.alert')}
                                tooltipTitle={t('status.alertLabel')}
                                tooltipText={t('status.alertTooltip')}
                              />
                            )}
                            {jumpStart && (
                              <StatusPill
                                variant="jumpStart"
                                text={t('status.jumpStart')}
                                tooltipTitle={t('times.jumpStart')}
                                tooltipText={t('times.jumpStartTooltip')}
                              />
                            )}
                          </div>
                          {pilotMeta && (
                            <p className="text-zinc-400 text-[11px] leading-tight truncate">
                              {pilotMeta}
                            </p>
                          )}
                          {timeDisplay && (
                            <StartInformationValue
                              as="p"
                              info={timeInfo}
                              fallback={timeDisplay}
                              className={`font-mono text-xs truncate ${timeColor}`}
                              style={{ fontFamily: 'JetBrains Mono, monospace' }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {bottomScroll < maxScroll && maxScroll > 0 && (
              <button
                onClick={() => setBottomScroll(Math.min(maxScroll, bottomScroll + 200))}
                className="absolute right-0 top-0 bottom-0 z-10 bg-black/90 hover:bg-black px-2 text-white"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
