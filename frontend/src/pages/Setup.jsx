import React, { useState, useRef } from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { Trash2, Plus, Eye, Upload, Download, Palette, Play } from 'lucide-react';

const CHROMA_PRESETS = [
  { name: 'Green Screen', value: '#00B140', label: 'G' },
  { name: 'Blue Screen', value: '#0047BB', label: 'B' },
  { name: 'Black', value: '#000000', label: 'K' }
];

export default function Setup() {
  const navigate = useNavigate();
  const {
    pilots,
    stages,
    times,
    currentStageId,
    chromaKey,
    setChromaKey,
    setCurrentStageId,
    addPilot,
    updatePilot,
    deletePilot,
    togglePilotActive,
    addStage,
    updateStage,
    deleteStage,
    setTime,
    getTime,
    exportData,
    importData,
    clearAllData
  } = useRally();

  const [newPilot, setNewPilot] = useState({ name: '', picture: '', streamUrl: '' });
  const [newStage, setNewStage] = useState({ name: '' });
  const [customChroma, setCustomChroma] = useState('#00B140');
  const fileInputRef = useRef(null);

  const handleAddPilot = () => {
    if (!newPilot.name.trim()) {
      toast.error('Pilot name is required');
      return;
    }
    addPilot(newPilot);
    setNewPilot({ name: '', picture: '', streamUrl: '' });
    toast.success('Pilot added successfully');
  };

  const handleAddStage = () => {
    if (!newStage.name.trim()) {
      toast.error('Stage name is required');
      return;
    }
    addStage(newStage);
    setNewStage({ name: '' });
    toast.success('Stage added successfully');
  };

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rally-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Configuration exported');
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const success = importData(e.target.result);
      if (success) {
        toast.success('Configuration imported successfully');
      } else {
        toast.error('Failed to import configuration');
      }
    };
    reader.readAsText(file);
  };

  const handleTimeChange = (pilotId, stageId, value) => {
    setTime(pilotId, stageId, value);
  };

  const activePilots = pilots.filter(p => p.isActive);
  const currentStage = stages.find(s => s.id === currentStageId);

  return (
    <div className="min-h-screen bg-[#09090B] text-white p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-5xl font-bold uppercase tracking-tighter" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              Rally Dashboard
            </h1>
            <p className="text-zinc-400 mt-2">Setup & Configuration</p>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={() => navigate('/overlay')}
              className="bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold"
              data-testid="go-to-overlay-button"
            >
              <Play className="w-4 h-4 mr-2" />
              Go Live
            </Button>
          </div>
        </div>

        {/* Chroma Key Selector */}
        <Card className="mb-6 bg-[#18181B] border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              <Palette className="w-5 h-5" />
              Background Color (Chroma Key)
            </CardTitle>
            <CardDescription>Select background color for video overlay</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {CHROMA_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setChromaKey(preset.value)}
                  className={`px-4 py-2 rounded border-2 transition-all hover:scale-105 ${
                    chromaKey === preset.value ? 'border-[#FF4500]' : 'border-zinc-700'
                  }`}
                  style={{ backgroundColor: preset.value }}
                  data-testid={`chroma-${preset.label.toLowerCase()}-button`}
                >
                  <span className="text-white font-bold" style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}>
                    {preset.name}
                  </span>
                </button>
              ))}
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  value={customChroma}
                  onChange={(e) => setCustomChroma(e.target.value)}
                  className="w-16 h-10 cursor-pointer"
                  data-testid="custom-chroma-picker"
                />
                <Button
                  onClick={() => setChromaKey(customChroma)}
                  variant="outline"
                  className="border-zinc-700"
                  data-testid="apply-custom-chroma-button"
                >
                  Apply Custom
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="pilots" className="space-y-6">
          <TabsList className="bg-[#18181B] border border-zinc-800">
            <TabsTrigger value="pilots" data-testid="tab-pilots">P<span className="underline">i</span>lots</TabsTrigger>
            <TabsTrigger value="stages" data-testid="tab-stages">S<span className="underline">t</span>ages</TabsTrigger>
            <TabsTrigger value="times" data-testid="tab-times">Ti<span className="underline">m</span>es</TabsTrigger>
            <TabsTrigger value="config" data-testid="tab-config">Con<span className="underline">f</span>ig</TabsTrigger>
          </TabsList>

          {/* Pilots Tab */}
          <TabsContent value="pilots" className="space-y-4">
            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Add New Pilot</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="pilot-name">Pilot Name *</Label>
                    <Input
                      id="pilot-name"
                      value={newPilot.name}
                      onChange={(e) => setNewPilot({ ...newPilot, name: e.target.value })}
                      placeholder="John Doe"
                      className="bg-[#09090B] border-zinc-700"
                      data-testid="input-pilot-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilot-picture">Picture URL</Label>
                    <Input
                      id="pilot-picture"
                      value={newPilot.picture}
                      onChange={(e) => setNewPilot({ ...newPilot, picture: e.target.value })}
                      placeholder="https://..."
                      className="bg-[#09090B] border-zinc-700"
                      data-testid="input-pilot-picture"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilot-stream">ninja.vdo Stream URL</Label>
                    <Input
                      id="pilot-stream"
                      value={newPilot.streamUrl}
                      onChange={(e) => setNewPilot({ ...newPilot, streamUrl: e.target.value })}
                      placeholder="https://ninja.vdo/..."
                      className="bg-[#09090B] border-zinc-700"
                      data-testid="input-pilot-stream"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleAddPilot}
                      className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90"
                      data-testid="button-add-pilot"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Pilot
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pilots.map((pilot) => (
                <Card key={pilot.id} className="bg-[#18181B] border-zinc-800" data-testid={`pilot-card-${pilot.id}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded bg-zinc-900 overflow-hidden flex-shrink-0">
                        {pilot.picture ? (
                          <img src={pilot.picture} alt={pilot.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-zinc-600">
                            {pilot.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          {pilot.name}
                        </h3>
                        {pilot.streamUrl && (
                          <p className="text-xs text-zinc-500 truncate font-mono">{pilot.streamUrl}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Switch
                            checked={pilot.isActive}
                            onCheckedChange={() => togglePilotActive(pilot.id)}
                            data-testid={`switch-pilot-active-${pilot.id}`}
                          />
                          <span className="text-sm">{pilot.isActive ? 'Active' : 'Inactive'}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deletePilot(pilot.id)}
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        data-testid={`button-delete-pilot-${pilot.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {pilots.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No pilots registered. Add your first pilot above.
              </div>
            )}
          </TabsContent>

          {/* Stages Tab */}
          <TabsContent value="stages" className="space-y-4">
            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Add New Stage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Input
                      value={newStage.name}
                      onChange={(e) => setNewStage({ name: e.target.value })}
                      placeholder="SS1 - Mountain Pass"
                      className="bg-[#09090B] border-zinc-700"
                      data-testid="input-stage-name"
                    />
                  </div>
                  <Button
                    onClick={handleAddStage}
                    className="bg-[#FF4500] hover:bg-[#FF4500]/90"
                    data-testid="button-add-stage"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Stage
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Current Stage</CardTitle>
                <CardDescription>Select the stage currently being raced</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={currentStageId || ''} onValueChange={setCurrentStageId}>
                  <SelectTrigger className="bg-[#09090B] border-zinc-700" data-testid="select-current-stage">
                    <SelectValue placeholder="Select current stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {currentStage && (
                  <p className="mt-2 text-[#FACC15] font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    LIVE: {currentStage.name}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-2">
              {stages.map((stage) => (
                <Card key={stage.id} className="bg-[#18181B] border-zinc-800" data-testid={`stage-card-${stage.id}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-xl uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {stage.name}
                      </h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteStage(stage.id)}
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        data-testid={`button-delete-stage-${stage.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {stages.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No stages registered. Add your first stage above.
              </div>
            )}
          </TabsContent>

          {/* Times Tab */}
          <TabsContent value="times">
            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Time Matrix</CardTitle>
                <CardDescription>Register times for each pilot in each stage</CardDescription>
              </CardHeader>
              <CardContent>
                {pilots.length === 0 || stages.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    Add pilots and stages first to register times.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-700">
                          <TableHead className="bg-[#18181B] text-white uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pilot</TableHead>
                          {stages.map((stage) => (
                            <TableHead key={stage.id} className="bg-[#18181B] text-white uppercase font-bold text-center" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              {stage.name}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pilots.map((pilot) => (
                          <TableRow key={pilot.id} className="border-zinc-700 hover:bg-white/5">
                            <TableCell className="font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              {pilot.name}
                            </TableCell>
                            {stages.map((stage) => (
                              <TableCell key={stage.id}>
                                <Input
                                  value={getTime(pilot.id, stage.id)}
                                  onChange={(e) => handleTimeChange(pilot.id, stage.id, e.target.value)}
                                  placeholder="00:00.000"
                                  className="bg-[#09090B] border-zinc-700 text-center font-mono"
                                  data-testid={`input-time-${pilot.id}-${stage.id}`}
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Config Tab */}
          <TabsContent value="config" className="space-y-4">
            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Keyboard Shortcuts</CardTitle>
                <CardDescription>Quick access to scenes on overlay page</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  <div className="flex justify-between p-2 bg-[#09090B] rounded">
                    <span><kbd className="px-2 py-1 bg-zinc-800 rounded">1</kbd> Scene 1</span>
                    <span className="text-zinc-500">Live Stage + Streams</span>
                  </div>
                  <div className="flex justify-between p-2 bg-[#09090B] rounded">
                    <span><kbd className="px-2 py-1 bg-zinc-800 rounded">2</kbd> Scene 2</span>
                    <span className="text-zinc-500">Timing Tower</span>
                  </div>
                  <div className="flex justify-between p-2 bg-[#09090B] rounded">
                    <span><kbd className="px-2 py-1 bg-zinc-800 rounded">3</kbd> Scene 3</span>
                    <span className="text-zinc-500">Leaderboard</span>
                  </div>
                  <div className="flex justify-between p-2 bg-[#09090B] rounded">
                    <span><kbd className="px-2 py-1 bg-zinc-800 rounded">4</kbd> Scene 4</span>
                    <span className="text-zinc-500">Pilot Focus</span>
                  </div>
                  <div className="flex justify-between p-2 bg-[#09090B] rounded">
                    <span><kbd className="px-2 py-1 bg-zinc-800 rounded">5</kbd> Scene 5</span>
                    <span className="text-zinc-500">Split Comparison</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Data Management</CardTitle>
                <CardDescription>Export or import your configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Button
                    onClick={handleExport}
                    variant="outline"
                    className="flex-1 border-zinc-700"
                    data-testid="button-export-config"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Configuration
                  </Button>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="flex-1 border-zinc-700"
                    data-testid="button-import-config"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import Configuration
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    className="hidden"
                  />
                </div>
                <div className="pt-4 border-t border-zinc-700">
                  <Button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to clear all data? This cannot be undone.')) {
                        clearAllData();
                        toast.success('All data cleared');
                      }
                    }}
                    variant="destructive"
                    className="w-full"
                    data-testid="button-clear-all"
                  >
                    Clear All Data
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Current Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="p-4 bg-[#09090B] rounded">
                    <div className="text-3xl font-bold text-[#FF4500]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {pilots.length}
                    </div>
                    <div className="text-sm text-zinc-500 mt-1">Total Pilots</div>
                  </div>
                  <div className="p-4 bg-[#09090B] rounded">
                    <div className="text-3xl font-bold text-[#FACC15]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {activePilots.length}
                    </div>
                    <div className="text-sm text-zinc-500 mt-1">Active Pilots</div>
                  </div>
                  <div className="p-4 bg-[#09090B] rounded">
                    <div className="text-3xl font-bold text-[#22C55E]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {stages.length}
                    </div>
                    <div className="text-sm text-zinc-500 mt-1">Total Stages</div>
                  </div>
                  <div className="p-4 bg-[#09090B] rounded">
                    <div className="text-3xl font-bold text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {Object.keys(times).length}
                    </div>
                    <div className="text-sm text-zinc-500 mt-1">Times Recorded</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
