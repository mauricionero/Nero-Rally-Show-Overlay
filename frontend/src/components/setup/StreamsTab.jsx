import React, { useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { AudioMeter, GlobalAudioMeter } from '../AudioMeter.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Volume2, VolumeX, Headphones, Plus, Trash2, Edit, Video } from 'lucide-react';

export default function StreamsTab() {
  const { t } = useTranslation();
  const {
    pilots,
    categories,
    cameras,
    streamConfigs,
    globalAudio,
    setGlobalAudio,
    getStreamConfig,
    setStreamConfig,
    setSoloStream,
    addCamera,
    updateCamera,
    deleteCamera,
    toggleCameraActive
  } = useRally();

  const [newCamera, setNewCamera] = useState({ name: '', streamUrl: '' });
  const [editingCamera, setEditingCamera] = useState(null);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);

  const sortedPilots = [...pilots].sort((a, b) => {
    const orderA = a.startOrder || 999;
    const orderB = b.startOrder || 999;
    return orderA - orderB;
  });

  const handleAddCamera = () => {
    if (!newCamera.name.trim()) {
      toast.error(t('streams.cameraName') + ' is required');
      return;
    }
    addCamera(newCamera);
    setNewCamera({ name: '', streamUrl: '' });
    toast.success('Camera added successfully');
  };

  const handleUpdateCamera = () => {
    if (!editingCamera.name.trim()) {
      toast.error(t('streams.cameraName') + ' is required');
      return;
    }
    updateCamera(editingCamera.id, editingCamera);
    setEditingCamera(null);
    setCameraDialogOpen(false);
    toast.success('Camera updated successfully');
  };

  // Render stream card (shared between pilots and cameras)
  const renderStreamCard = (item, type = 'pilot') => {
    const config = getStreamConfig(item.id);
    const category = type === 'pilot' ? categories.find(c => c.id === item.categoryId) : null;
    const hasSoloStream = Object.values(streamConfigs).some(c => c?.solo);
    const isEffectivelyMuted = config.muted || globalAudio.muted || (hasSoloStream && !config.solo);
    
    return (
      <Card 
        key={item.id} 
        className={`bg-[#09090B] border-zinc-700 relative overflow-hidden ${config.solo ? 'ring-2 ring-[#FACC15]' : ''}`}
        data-testid={`stream-config-card-${item.id}`}
      >
        {category && (
          <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
        )}
        {type === 'camera' && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#FF4500]" />
        )}
        <CardContent className="pt-4 pl-4">
          {/* Stream Preview with Audio Meter */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 aspect-video bg-black rounded overflow-hidden" style={{ maxHeight: '150px' }}>
              <StreamPlayer
                pilotId={item.id}
                streamUrl={item.streamUrl}
                name={item.name}
                className="w-full h-full"
                showControls={false}
                showMeter={true}
              />
            </div>
            {/* Audio Level Meter */}
            <AudioMeter
              isActive={item.isActive}
              isMuted={isEffectivelyMuted}
              volume={Math.round((config.volume / 100) * (globalAudio.volume / 100) * 100)}
              height={85}
              width={10}
            />
          </div>
          
          {/* Name and Controls */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm uppercase text-white truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {type === 'pilot' && `#${item.startOrder || '?'} `}{item.name}
            </h3>
            <div className="flex items-center gap-1">
              {/* Solo Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSoloStream(item.id)}
                className={`h-7 w-7 ${config.solo ? 'bg-[#FACC15] text-black hover:bg-[#FACC15]/80' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                title={t('streams.solo')}
                data-testid={`stream-solo-${item.id}`}
              >
                <Headphones className="w-4 h-4" />
              </Button>
              {/* Mute Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setStreamConfig(item.id, { muted: !config.muted })}
                className={`h-7 w-7 ${config.muted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                title={t('streams.mute')}
                data-testid={`stream-mute-${item.id}`}
              >
                {config.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
              {/* Camera-specific: Edit and Delete */}
              {type === 'camera' && (
                <>
                  <Dialog open={cameraDialogOpen && editingCamera?.id === item.id} onOpenChange={(open) => {
                    setCameraDialogOpen(open);
                    if (!open) setEditingCamera(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingCamera({ ...item })}
                        className="h-7 w-7 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#18181B] border-zinc-800 text-white">
                      <DialogHeader>
                        <DialogTitle className="text-white">{t('common.edit')} {t('streams.cameraName')}</DialogTitle>
                      </DialogHeader>
                      {editingCamera && (
                        <div className="space-y-4">
                          <div>
                            <Label className="text-white">{t('streams.cameraName')} *</Label>
                            <Input
                              value={editingCamera.name}
                              onChange={(e) => setEditingCamera({ ...editingCamera, name: e.target.value })}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-white">{t('pilots.streamUrl')}</Label>
                            <Input
                              value={editingCamera.streamUrl}
                              onChange={(e) => setEditingCamera({ ...editingCamera, streamUrl: e.target.value })}
                              className="bg-[#09090B] border-zinc-700 text-white"
                            />
                          </div>
                        </div>
                      )}
                      <DialogFooter>
                        <Button onClick={handleUpdateCamera} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
                          {t('common.save')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm(t('common.delete') + '?')) {
                        deleteCamera(item.id);
                        toast.success('Camera deleted');
                      }
                    }}
                    className="h-7 w-7 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Camera Active Toggle */}
          {type === 'camera' && (
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-700">
              <Switch
                checked={item.isActive}
                onCheckedChange={() => toggleCameraActive(item.id)}
                className="data-[state=checked]:bg-[#22C55E]"
              />
              <span className="text-sm text-white">{item.isActive ? t('status.active') : t('status.inactive')}</span>
            </div>
          )}
          
          {/* Volume Slider */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-zinc-400">{t('streams.volume')}</Label>
                <span className="text-xs text-zinc-500 font-mono">{config.volume}%</span>
              </div>
              <Slider
                value={[config.volume]}
                onValueChange={([val]) => setStreamConfig(item.id, { volume: val })}
                max={100}
                min={0}
                step={5}
                className="w-full"
                data-testid={`stream-volume-${item.id}`}
              />
            </div>
            
            {/* Video Adjustments */}
            <div className="pt-2 border-t border-zinc-700">
              <Label className="text-xs text-zinc-400 block mb-2">Video</Label>
              
              {/* Saturation */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-zinc-500 w-20">{t('streams.saturation')}</span>
                <Slider
                  value={[config.saturation]}
                  onValueChange={([val]) => setStreamConfig(item.id, { saturation: val })}
                  max={200}
                  min={0}
                  step={10}
                  className="flex-1"
                  data-testid={`stream-saturation-${item.id}`}
                />
                <span className="text-xs text-zinc-500 font-mono w-10 text-right">{config.saturation}%</span>
              </div>
              
              {/* Contrast */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-zinc-500 w-20">{t('streams.contrast')}</span>
                <Slider
                  value={[config.contrast]}
                  onValueChange={([val]) => setStreamConfig(item.id, { contrast: val })}
                  max={200}
                  min={0}
                  step={10}
                  className="flex-1"
                  data-testid={`stream-contrast-${item.id}`}
                />
                <span className="text-xs text-zinc-500 font-mono w-10 text-right">{config.contrast}%</span>
              </div>
              
              {/* Brightness */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 w-20">{t('streams.brightness')}</span>
                <Slider
                  value={[config.brightness]}
                  onValueChange={([val]) => setStreamConfig(item.id, { brightness: val })}
                  max={200}
                  min={0}
                  step={10}
                  className="flex-1"
                  data-testid={`stream-brightness-${item.id}`}
                />
                <span className="text-xs text-zinc-500 font-mono w-10 text-right">{config.brightness}%</span>
              </div>
            </div>
            
            {/* Reset Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStreamConfig(item.id, {
                volume: 100,
                muted: false,
                saturation: 100,
                contrast: 100,
                brightness: 100
              })}
              className="w-full text-xs text-zinc-400 hover:text-white mt-2"
              data-testid={`stream-reset-${item.id}`}
            >
              {t('streams.resetDefaults')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Global Audio Control */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="uppercase text-white text-lg" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('streams.globalAudioControl')}</CardTitle>
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
                  <Label className="text-sm text-white">{t('streams.masterVolume')}</Label>
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
                  {globalAudio.muted ? t('streams.unmuteAll') : t('streams.muteAll')}
                </Button>
                {globalAudio.muted && (
                  <span className="text-red-500 text-sm font-bold animate-pulse">ALL AUDIO MUTED</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Cameras Section */}
      <Card className="bg-[#18181B] border-zinc-800 border-l-4 border-l-[#FF4500]">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Video className="w-5 h-5 text-[#FF4500]" />
            {t('streams.additionalCameras')}
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Add external cameras like finish line, helicopter, or course cameras for use in the overlay.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Add Camera Form */}
          <div className="flex gap-4 mb-4 p-3 bg-[#09090B] rounded border border-zinc-700">
            <div className="flex-1">
              <Label className="text-white text-xs">{t('streams.cameraName')} *</Label>
              <Input
                value={newCamera.name}
                onChange={(e) => setNewCamera({ ...newCamera, name: e.target.value })}
                placeholder={t('streams.placeholder.cameraName')}
                className="bg-[#18181B] border-zinc-700 text-white"
                data-testid="input-camera-name"
              />
            </div>
            <div className="flex-1">
              <Label className="text-white text-xs">{t('pilots.streamUrl')}</Label>
              <Input
                value={newCamera.streamUrl}
                onChange={(e) => setNewCamera({ ...newCamera, streamUrl: e.target.value })}
                placeholder={t('streams.placeholder.streamUrl')}
                className="bg-[#18181B] border-zinc-700 text-white"
                data-testid="input-camera-stream"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleAddCamera}
                className="bg-[#FF4500] hover:bg-[#FF4500]/90"
                data-testid="button-add-camera"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('streams.addCamera')}
              </Button>
            </div>
          </div>

          {/* Camera Cards */}
          {cameras.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              {t('streams.noCameras')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {cameras.map((camera) => renderStreamCard(camera, 'camera'))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pilot Streams Section */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('streams.pilotStreams')}</CardTitle>
          <CardDescription className="text-zinc-400">
            Configure audio and video settings for each pilot&apos;s stream. Changes apply live to the overlay.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedPilots.filter(p => p.streamUrl).length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              {t('streams.noActiveStreams')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sortedPilots.filter(p => p.streamUrl).map((pilot) => renderStreamCard(pilot, 'pilot'))}
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
