import React from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Slider } from '../ui/slider';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { AudioMeter, GlobalAudioMeter } from '../AudioMeter.jsx';
import { Volume2, VolumeX, Headphones } from 'lucide-react';

export default function StreamsTab() {
  const {
    pilots,
    categories,
    streamConfigs,
    globalAudio,
    setGlobalAudio,
    getStreamConfig,
    setStreamConfig,
    setSoloStream
  } = useRally();

  const sortedPilots = [...pilots].sort((a, b) => {
    const orderA = a.startOrder || 999;
    const orderB = b.startOrder || 999;
    return orderA - orderB;
  });

  return (
    <div className="space-y-4">
      {/* Global Audio Control */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="uppercase text-white text-lg" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Master Audio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            {/* Global Audio Meter */}
            <GlobalAudioMeter
              streamConfigs={streamConfigs}
              globalVolume={globalAudio.volume}
              globalMuted={globalAudio.muted}
              height={100}
              width={16}
            />
            
            <div className="flex-1 space-y-3">
              {/* Global Volume */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-sm text-white">Master Volume</Label>
                  <span className="text-sm text-zinc-400 font-mono">{globalAudio.volume}%</span>
                </div>
                <Slider
                  value={[globalAudio.volume]}
                  onValueChange={([val]) => setGlobalAudio({ ...globalAudio, volume: val })}
                  max={100}
                  min={0}
                  step={5}
                  className="w-full"
                  data-testid="global-volume-slider"
                />
              </div>
              
              {/* Global Mute */}
              <div className="flex items-center gap-3">
                <Button
                  variant={globalAudio.muted ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setGlobalAudio({ ...globalAudio, muted: !globalAudio.muted })}
                  className={globalAudio.muted ? "" : "border-zinc-700 text-white"}
                  data-testid="global-mute-button"
                >
                  {globalAudio.muted ? <VolumeX className="w-4 h-4 mr-2" /> : <Volume2 className="w-4 h-4 mr-2" />}
                  {globalAudio.muted ? 'Unmute All' : 'Mute All'}
                </Button>
                {globalAudio.muted && (
                  <span className="text-red-500 text-sm font-bold animate-pulse">ALL AUDIO MUTED</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stream Control Panel */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Individual Stream Controls</CardTitle>
          <CardDescription className="text-zinc-400">
            Configure audio and video settings for each pilot&apos;s stream. Changes apply live to the overlay.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedPilots.filter(p => p.streamUrl).length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              No pilots with stream URLs. Add stream URLs in the Pilots tab first.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sortedPilots.filter(p => p.streamUrl).map((pilot) => {
                const config = getStreamConfig(pilot.id);
                const category = categories.find(c => c.id === pilot.categoryId);
                const hasSoloStream = Object.values(streamConfigs).some(c => c?.solo);
                const isEffectivelyMuted = config.muted || globalAudio.muted || (hasSoloStream && !config.solo);
                
                return (
                  <Card 
                    key={pilot.id} 
                    className={`bg-[#09090B] border-zinc-700 relative overflow-hidden ${config.solo ? 'ring-2 ring-[#FACC15]' : ''}`}
                    data-testid={`stream-config-card-${pilot.id}`}
                  >
                    {category && (
                      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
                    )}
                    <CardContent className="pt-4 pl-4">
                      {/* Stream Preview with Audio Meter */}
                      <div className="flex gap-2 mb-3">
                        <div className="flex-1 aspect-video bg-black rounded overflow-hidden" style={{ maxHeight: '150px' }}>
                          <StreamPlayer
                            pilotId={pilot.id}
                            streamUrl={pilot.streamUrl}
                            name={pilot.name}
                            className="w-full h-full"
                            showControls={false}
                            showMeter={true}
                          />
                        </div>
                        {/* Audio Level Meter */}
                        <AudioMeter
                          isActive={pilot.isActive}
                          isMuted={isEffectivelyMuted}
                          volume={Math.round((config.volume / 100) * (globalAudio.volume / 100) * 100)}
                          height={85}
                          width={10}
                        />
                      </div>
                      
                      {/* Pilot Name */}
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-sm uppercase text-white truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          #{pilot.startOrder || '?'} {pilot.name}
                        </h3>
                        <div className="flex items-center gap-1">
                          {/* Solo Button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSoloStream(pilot.id)}
                            className={`h-7 w-7 ${config.solo ? 'bg-[#FACC15] text-black hover:bg-[#FACC15]/80' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                            title="Solo (mute all others)"
                            data-testid={`stream-solo-${pilot.id}`}
                          >
                            <Headphones className="w-4 h-4" />
                          </Button>
                          {/* Mute Button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setStreamConfig(pilot.id, { muted: !config.muted })}
                            className={`h-7 w-7 ${config.muted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                            title="Mute"
                            data-testid={`stream-mute-${pilot.id}`}
                          >
                            {config.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      
                      {/* Volume Slider */}
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs text-zinc-400">Volume</Label>
                            <span className="text-xs text-zinc-500 font-mono">{config.volume}%</span>
                          </div>
                          <Slider
                            value={[config.volume]}
                            onValueChange={([val]) => setStreamConfig(pilot.id, { volume: val })}
                            max={100}
                            min={0}
                            step={5}
                            className="w-full"
                            data-testid={`stream-volume-${pilot.id}`}
                          />
                        </div>
                        
                        {/* Video Adjustments */}
                        <div className="pt-2 border-t border-zinc-700">
                          <Label className="text-xs text-zinc-400 block mb-2">Video Adjustments</Label>
                          
                          {/* Saturation */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-zinc-500 w-20">Saturation</span>
                            <Slider
                              value={[config.saturation]}
                              onValueChange={([val]) => setStreamConfig(pilot.id, { saturation: val })}
                              max={200}
                              min={0}
                              step={10}
                              className="flex-1"
                              data-testid={`stream-saturation-${pilot.id}`}
                            />
                            <span className="text-xs text-zinc-500 font-mono w-10 text-right">{config.saturation}%</span>
                          </div>
                          
                          {/* Contrast */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-zinc-500 w-20">Contrast</span>
                            <Slider
                              value={[config.contrast]}
                              onValueChange={([val]) => setStreamConfig(pilot.id, { contrast: val })}
                              max={200}
                              min={0}
                              step={10}
                              className="flex-1"
                              data-testid={`stream-contrast-${pilot.id}`}
                            />
                            <span className="text-xs text-zinc-500 font-mono w-10 text-right">{config.contrast}%</span>
                          </div>
                          
                          {/* Brightness */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500 w-20">Brightness</span>
                            <Slider
                              value={[config.brightness]}
                              onValueChange={([val]) => setStreamConfig(pilot.id, { brightness: val })}
                              max={200}
                              min={0}
                              step={10}
                              className="flex-1"
                              data-testid={`stream-brightness-${pilot.id}`}
                            />
                            <span className="text-xs text-zinc-500 font-mono w-10 text-right">{config.brightness}%</span>
                          </div>
                        </div>
                        
                        {/* Reset Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStreamConfig(pilot.id, {
                            volume: 100,
                            muted: false,
                            saturation: 100,
                            contrast: 100,
                            brightness: 100
                          })}
                          className="w-full text-xs text-zinc-400 hover:text-white mt-2"
                          data-testid={`stream-reset-${pilot.id}`}
                        >
                          Reset to Defaults
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Note about audio meters */}
      <div className="text-xs text-zinc-600 text-center px-4">
        Note: Audio meters show simulated levels based on volume settings. For real audio monitoring, VDO.Ninja streams include built-in meters via the &amp;meter=1 parameter.
      </div>
    </div>
  );
}
