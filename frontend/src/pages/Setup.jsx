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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { TimeInput } from '../components/TimeInput.jsx';
import { StreamThumbnail } from '../components/StreamThumbnail.jsx';
import { StreamPlayer } from '../components/StreamPlayer.jsx';
import { CategoryBar } from '../components/CategoryBadge.jsx';
import { arrivalTimeToTotal, totalTimeToArrival } from '../utils/timeConversion';
import { toast } from 'sonner';
import { Trash2, Plus, Play, Upload, Download, Palette, Edit, Volume2, VolumeX, Headphones } from 'lucide-react';
import { Slider } from '../components/ui/slider';

const CHROMA_PRESETS = [
  { name: 'Black', value: '#000000', label: 'K' },
  { name: 'Green Screen', value: '#00B140', label: 'G' },
  { name: 'Blue Screen', value: '#0047BB', label: 'B' }
];

const STAGE_TYPES = ['SS', 'Liaison', 'Service Park', 'Other'];

export default function Setup() {
  const navigate = useNavigate();
  const {
    pilots,
    categories,
    stages,
    times,
    arrivalTimes,
    startTimes,
    currentStageId,
    chromaKey,
    setChromaKey,
    setCurrentStageId,
    addPilot,
    updatePilot,
    deletePilot,
    togglePilotActive,
    addCategory,
    updateCategory,
    deleteCategory,
    addStage,
    updateStage,
    deleteStage,
    setTime,
    getTime,
    setArrivalTime,
    getArrivalTime,
    setStartTime,
    getStartTime,
    getStreamConfig,
    setStreamConfig,
    setSoloStream,
    exportData,
    importData,
    clearAllData
  } = useRally();

  const [newPilot, setNewPilot] = useState({ name: '', picture: '', streamUrl: '', categoryId: null, startOrder: '' });
  const [newCategory, setNewCategory] = useState({ name: '', color: '#FF4500' });
  const [newStage, setNewStage] = useState({ name: '', type: 'SS', ssNumber: '', startTime: '' });
  const [customChroma, setCustomChroma] = useState('#000000');
  const [editingPilot, setEditingPilot] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  const [pilotDialogOpen, setPilotDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const fileInputRef = useRef(null);

  const handleAddPilot = () => {
    if (!newPilot.name.trim()) {
      toast.error('Pilot name is required');
      return;
    }
    const pilotData = {
      ...newPilot,
      startOrder: parseInt(newPilot.startOrder) || 999
    };
    addPilot(pilotData);
    setNewPilot({ name: '', picture: '', streamUrl: '', categoryId: null, startOrder: '' });
    toast.success('Pilot added successfully');
  };

  const handleUpdatePilot = () => {
    if (!editingPilot.name.trim()) {
      toast.error('Pilot name is required');
      return;
    }
    const pilotData = {
      ...editingPilot,
      startOrder: parseInt(editingPilot.startOrder) || 999
    };
    updatePilot(editingPilot.id, pilotData);
    setEditingPilot(null);
    setPilotDialogOpen(false);
    toast.success('Pilot updated successfully');
  };

  const handleAddCategory = () => {
    if (!newCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    addCategory(newCategory);
    setNewCategory({ name: '', color: '#FF4500' });
    toast.success('Category added successfully');
  };

  const handleUpdateCategory = () => {
    if (!editingCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    updateCategory(editingCategory.id, editingCategory);
    setEditingCategory(null);
    setCategoryDialogOpen(false);
    toast.success('Category updated successfully');
  };

  const handleAddStage = () => {
    if (!newStage.name.trim()) {
      toast.error('Stage name is required');
      return;
    }
    addStage(newStage);
    setNewStage({ name: '', type: 'SS', ssNumber: '', startTime: '' });
    toast.success('Stage added successfully');
  };

  const handleUpdateStage = () => {
    if (!editingStage.name.trim()) {
      toast.error('Stage name is required');
      return;
    }
    updateStage(editingStage.id, editingStage);
    setEditingStage(null);
    setStageDialogOpen(false);
    toast.success('Stage updated successfully');
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

  const handleGoLive = () => {
    window.open('/overlay', '_blank');
    toast.success('Overlay page opened in new tab');
  };

  const handleArrivalTimeChange = (pilotId, stageId, value) => {
    setArrivalTime(pilotId, stageId, value);
    const startTime = getStartTime(pilotId, stageId);
    if (startTime && value) {
      const totalTime = arrivalTimeToTotal(value, startTime);
      if (totalTime) {
        setTime(pilotId, stageId, totalTime);
      }
    }
  };

  const handleTotalTimeChange = (pilotId, stageId, value) => {
    setTime(pilotId, stageId, value);
    const startTime = getStartTime(pilotId, stageId);
    if (startTime && value) {
      const arrivalTime = totalTimeToArrival(value, startTime);
      if (arrivalTime) {
        setArrivalTime(pilotId, stageId, arrivalTime);
      }
    }
  };

  // Sort pilots by start order
  const sortedPilots = [...pilots].sort((a, b) => {
    const orderA = a.startOrder || 999;
    const orderB = b.startOrder || 999;
    return orderA - orderB;
  });

  // Sort stages by start time
  const sortedStages = [...stages].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  const activePilots = pilots.filter(p => p.isActive);
  const currentStage = stages.find(s => s.id === currentStageId);

  return (
    <div className="min-h-screen bg-[#09090B] text-white p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-5xl font-bold uppercase tracking-tighter text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              Rally Dashboard
            </h1>
            <p className="text-zinc-400 mt-2">Setup & Configuration</p>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={handleGoLive}
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
            <CardTitle className="flex items-center gap-2 uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              <Palette className="w-5 h-5" />
              Background Color (Chroma Key)
            </CardTitle>
            <CardDescription className="text-zinc-400">Select background color for video overlay</CardDescription>
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
                  className="border-zinc-700 text-white"
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
            <TabsTrigger value="pilots" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-pilots">👤 Pilots</TabsTrigger>
            <TabsTrigger value="categories" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-categories">🏷️ Categories</TabsTrigger>
            <TabsTrigger value="stages" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-stages">📍 Stages</TabsTrigger>
            <TabsTrigger value="times" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-times">⏱️ Times</TabsTrigger>
            <TabsTrigger value="streams" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-streams">📹 Streams</TabsTrigger>
            <TabsTrigger value="config" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-config">⚙️ Config</TabsTrigger>
          </TabsList>

          {/* Pilots Tab */}
          <TabsContent value="pilots" className="space-y-4">
            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Add New Pilot</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div>
                    <Label htmlFor="pilot-name" className="text-white">👤 Pilot Name *</Label>
                    <Input
                      id="pilot-name"
                      value={newPilot.name}
                      onChange={(e) => setNewPilot({ ...newPilot, name: e.target.value })}
                      placeholder="John Doe"
                      className="bg-[#09090B] border-zinc-700 text-white"
                      data-testid="input-pilot-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilot-order" className="text-white">🔢 Start Order</Label>
                    <Input
                      id="pilot-order"
                      type="number"
                      value={newPilot.startOrder}
                      onChange={(e) => setNewPilot({ ...newPilot, startOrder: e.target.value })}
                      placeholder="1"
                      className="bg-[#09090B] border-zinc-700 text-white"
                      data-testid="input-pilot-order"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilot-category" className="text-white">🏷️ Category</Label>
                    <Select value={newPilot.categoryId || 'none'} onValueChange={(val) => setNewPilot({ ...newPilot, categoryId: val === 'none' ? null : val })}>
                      <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white" id="pilot-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="pilot-picture" className="text-white">🖼️ Picture URL</Label>
                    <Input
                      id="pilot-picture"
                      value={newPilot.picture}
                      onChange={(e) => setNewPilot({ ...newPilot, picture: e.target.value })}
                      placeholder="https://..."
                      className="bg-[#09090B] border-zinc-700 text-white"
                      data-testid="input-pilot-picture"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilot-stream" className="text-white">📹 Stream URL</Label>
                    <Input
                      id="pilot-stream"
                      value={newPilot.streamUrl}
                      onChange={(e) => setNewPilot({ ...newPilot, streamUrl: e.target.value })}
                      placeholder="https://ninja.vdo/..."
                      className="bg-[#09090B] border-zinc-700 text-white"
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
              {sortedPilots.map((pilot) => (
                <Card key={pilot.id} className="bg-[#18181B] border-zinc-800 relative" data-testid={`pilot-card-${pilot.id}`}>
                  <CategoryBar categoryId={pilot.categoryId} />
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <StreamThumbnail
                        streamUrl={pilot.streamUrl}
                        name={pilot.name}
                        showAlways={true}
                        className="w-20 h-20 rounded flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-sm">#{pilot.startOrder || '?'}</span>
                          <h3 className="font-bold text-lg uppercase truncate text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                            {pilot.name}
                          </h3>
                        </div>
                        {pilot.streamUrl && (
                          <p className="text-xs text-zinc-500 truncate font-mono mt-1">{pilot.streamUrl}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Switch
                            checked={pilot.isActive}
                            onCheckedChange={() => togglePilotActive(pilot.id)}
                            className="data-[state=checked]:bg-[#22C55E]"
                            data-testid={`switch-pilot-active-${pilot.id}`}
                          />
                          <span className="text-sm text-white">📹 {pilot.isActive ? 'Stream Active' : 'Stream Inactive'}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Dialog open={pilotDialogOpen && editingPilot?.id === pilot.id} onOpenChange={(open) => {
                          setPilotDialogOpen(open);
                          if (!open) setEditingPilot(null);
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingPilot({ ...pilot })}
                              className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                              data-testid={`button-edit-pilot-${pilot.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-[#18181B] border-zinc-800 text-white">
                            <DialogHeader>
                              <DialogTitle className="text-white">Edit Pilot</DialogTitle>
                            </DialogHeader>
                            {editingPilot && (
                              <div className="space-y-4">
                                <div>
                                  <Label className="text-white">👤 Pilot Name *</Label>
                                  <Input
                                    value={editingPilot.name}
                                    onChange={(e) => setEditingPilot({ ...editingPilot, name: e.target.value })}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="text-white">🔢 Start Order</Label>
                                  <Input
                                    type="number"
                                    value={editingPilot.startOrder || ''}
                                    onChange={(e) => setEditingPilot({ ...editingPilot, startOrder: e.target.value })}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="text-white">🏷️ Category</Label>
                                  <Select value={editingPilot.categoryId || 'none'} onValueChange={(val) => setEditingPilot({ ...editingPilot, categoryId: val === 'none' ? null : val })}>
                                    <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                                      <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">None</SelectItem>
                                      {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-white">🖼️ Picture URL</Label>
                                  <Input
                                    value={editingPilot.picture}
                                    onChange={(e) => setEditingPilot({ ...editingPilot, picture: e.target.value })}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="text-white">📹 Stream URL</Label>
                                  <Input
                                    value={editingPilot.streamUrl}
                                    onChange={(e) => setEditingPilot({ ...editingPilot, streamUrl: e.target.value })}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                  />
                                </div>
                              </div>
                            )}
                            <DialogFooter>
                              <Button onClick={handleUpdatePilot} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
                                Update Pilot
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm('Delete this pilot?')) {
                              deletePilot(pilot.id);
                              toast.success('Pilot deleted');
                            }
                          }}
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          data-testid={`button-delete-pilot-${pilot.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {sortedPilots.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No pilots registered. Add your first pilot above.
              </div>
            )}
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-4">
            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>🏷️ Add New Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label className="text-white">Category Name *</Label>
                    <Input
                      value={newCategory.name}
                      onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                      placeholder="Group A"
                      className="bg-[#09090B] border-zinc-700 text-white"
                      data-testid="input-category-name"
                    />
                  </div>
                  <div className="w-32">
                    <Label className="text-white">🎨 Color</Label>
                    <Input
                      type="color"
                      value={newCategory.color}
                      onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                      className="h-10 cursor-pointer"
                      data-testid="input-category-color"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleAddCategory}
                      className="bg-[#FF4500] hover:bg-[#FF4500]/90"
                      data-testid="button-add-category"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {categories.map((category) => (
                <Card key={category.id} className="bg-[#18181B] border-zinc-800 relative" data-testid={`category-card-${category.id}`}>
                  <div className="absolute left-0 top-0 bottom-0 w-2" style={{ backgroundColor: category.color }} />
                  <CardContent className="pt-6 pl-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-xl uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif', color: category.color }}>
                          {category.name}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">{category.color}</p>
                      </div>
                      <div className="flex gap-1">
                        <Dialog open={categoryDialogOpen && editingCategory?.id === category.id} onOpenChange={(open) => {
                          setCategoryDialogOpen(open);
                          if (!open) setEditingCategory(null);
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingCategory({ ...category })}
                              className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                              data-testid={`button-edit-category-${category.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-[#18181B] border-zinc-800 text-white">
                            <DialogHeader>
                              <DialogTitle className="text-white">Edit Category</DialogTitle>
                            </DialogHeader>
                            {editingCategory && (
                              <div className="space-y-4">
                                <div>
                                  <Label className="text-white">Category Name *</Label>
                                  <Input
                                    value={editingCategory.name}
                                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="text-white">Color</Label>
                                  <Input
                                    type="color"
                                    value={editingCategory.color}
                                    onChange={(e) => setEditingCategory({ ...editingCategory, color: e.target.value })}
                                    className="h-10 cursor-pointer"
                                  />
                                </div>
                              </div>
                            )}
                            <DialogFooter>
                              <Button onClick={handleUpdateCategory} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
                                Update Category
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm('Delete this category?')) {
                              deleteCategory(category.id);
                              toast.success('Category deleted');
                            }
                          }}
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          data-testid={`button-delete-category-${category.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {categories.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No categories created. Add your first category above.
              </div>
            )}
          </TabsContent>

          {/* Stages Tab */}
          <TabsContent value="stages" className="space-y-4">
            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Add New Stage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="md:col-span-2">
                    <Label className="text-white">📍 Stage Name *</Label>
                    <Input
                      value={newStage.name}
                      onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
                      placeholder="SS1 - Mountain Pass"
                      className="bg-[#09090B] border-zinc-700 text-white"
                      data-testid="input-stage-name"
                    />
                  </div>
                  <div>
                    <Label className="text-white">🏁 Type</Label>
                    <Select value={newStage.type} onValueChange={(val) => setNewStage({ ...newStage, type: val })}>
                      <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white">🔢 SS Number</Label>
                    <Input
                      value={newStage.ssNumber}
                      onChange={(e) => setNewStage({ ...newStage, ssNumber: e.target.value })}
                      placeholder="1"
                      className="bg-[#09090B] border-zinc-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-white">⏰ Start Time (HH:MM)</Label>
                    <Input
                      value={newStage.startTime}
                      onChange={(e) => setNewStage({ ...newStage, startTime: e.target.value })}
                      placeholder="09:00"
                      className="bg-[#09090B] border-zinc-700 text-white"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleAddStage}
                      className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90"
                      data-testid="button-add-stage"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Current Stage</CardTitle>
                <CardDescription className="text-zinc-400">Select the stage currently being raced</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={currentStageId || ''} onValueChange={setCurrentStageId}>
                  <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white" data-testid="select-current-stage">
                    <SelectValue placeholder="Select current stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedStages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.ssNumber ? `SS${stage.ssNumber} - ` : ''}{stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {currentStage && (
                  <p className="mt-2 text-[#FACC15] font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    LIVE: {currentStage.ssNumber ? `SS${currentStage.ssNumber} - ` : ''}{currentStage.name}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-2">
              {sortedStages.map((stage) => (
                <Card key={stage.id} className="bg-[#18181B] border-zinc-800" data-testid={`stage-card-${stage.id}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-xl uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          {stage.ssNumber && <span className="text-[#FF4500]">SS{stage.ssNumber}</span>} {stage.name}
                        </h3>
                        <div className="flex gap-4 mt-1 text-sm text-zinc-400">
                          <span>Type: {stage.type}</span>
                          {stage.startTime && <span>Start: {stage.startTime}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Dialog open={stageDialogOpen && editingStage?.id === stage.id} onOpenChange={(open) => {
                          setStageDialogOpen(open);
                          if (!open) setEditingStage(null);
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingStage({ ...stage })}
                              className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                              data-testid={`button-edit-stage-${stage.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-[#18181B] border-zinc-800 text-white">
                            <DialogHeader>
                              <DialogTitle className="text-white">Edit Stage</DialogTitle>
                            </DialogHeader>
                            {editingStage && (
                              <div className="space-y-4">
                                <div>
                                  <Label className="text-white">Stage Name *</Label>
                                  <Input
                                    value={editingStage.name}
                                    onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="text-white">Type</Label>
                                  <Select value={editingStage.type} onValueChange={(val) => setEditingStage({ ...editingStage, type: val })}>
                                    <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {STAGE_TYPES.map((type) => (
                                        <SelectItem key={type} value={type}>{type}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-white">SS Number</Label>
                                  <Input
                                    value={editingStage.ssNumber}
                                    onChange={(e) => setEditingStage({ ...editingStage, ssNumber: e.target.value })}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="text-white">Start Time (HH:MM)</Label>
                                  <Input
                                    value={editingStage.startTime}
                                    onChange={(e) => setEditingStage({ ...editingStage, startTime: e.target.value })}
                                    className="bg-[#09090B] border-zinc-700 text-white"
                                  />
                                </div>
                              </div>
                            )}
                            <DialogFooter>
                              <Button onClick={handleUpdateStage} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
                                Update Stage
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm('Delete this stage?')) {
                              deleteStage(stage.id);
                              toast.success('Stage deleted');
                            }
                          }}
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          data-testid={`button-delete-stage-${stage.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
                <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>⏱️ Time Matrix</CardTitle>
                <CardDescription className="text-zinc-400">Register start times and finish times for each pilot in each stage</CardDescription>
              </CardHeader>
              <CardContent>
                {sortedPilots.length === 0 || sortedStages.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    Add pilots and stages first to register times.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-700">
                          <TableHead className="bg-[#18181B] text-white uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>👤 Pilot</TableHead>
                          {sortedStages.map((stage) => (
                            <TableHead key={stage.id} className="bg-[#18181B] text-white uppercase font-bold text-center" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              <div>{stage.ssNumber ? `📍 SS${stage.ssNumber}` : stage.name}</div>
                              <div className="text-xs text-zinc-400 font-normal">🟢 Start / 🏁 Arrival  / 🏁 Total</div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedPilots.map((pilot) => (
                          <TableRow key={pilot.id} className="border-zinc-700 hover:bg-white/5">
                            <TableCell className="font-bold text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              <div className="flex items-center gap-2">
                                <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                                {pilot.name}
                              </div>
                            </TableCell>
                            {sortedStages.map((stage) => (
                              <TableCell key={stage.id}>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs">🟢</span>
                                    <Input
                                      value={getStartTime(pilot.id, stage.id)}
                                      onChange={(e) => setStartTime(pilot.id, stage.id, e.target.value)}
                                      placeholder="HH:MM"
                                      className="bg-[#09090B] border-zinc-700 text-center font-mono text-xs text-white h-7"
                                      data-testid={`input-start-${pilot.id}-${stage.id}`}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs">🏁</span>
                                    <div className="flex gap-1 flex-1">
                                      <TimeInput
                                        value={getArrivalTime(pilot.id, stage.id)}
                                        onChange={(val) => handleArrivalTimeChange(pilot.id, stage.id, val)}
                                        placeholder="HH:MM:SS.000"
                                        className="bg-[#09090B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                                        data-testid={`input-arrival-${pilot.id}-${stage.id}`}
                                      />
                                      <TimeInput
                                        value={getTime(pilot.id, stage.id)}
                                        onChange={(val) => handleTotalTimeChange(pilot.id, stage.id, val)}
                                        placeholder="MM:SS.000"
                                        className="bg-[#09090B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                                        data-testid={`input-time-${pilot.id}-${stage.id}`}
                                      />
                                    </div>
                                  </div>
                                </div>
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
                <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Keyboard Shortcuts</CardTitle>
                <CardDescription className="text-zinc-400">Quick access to scenes on overlay page</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  <div className="flex justify-between p-2 bg-[#09090B] rounded text-white">
                    <span><kbd className="px-2 py-1 bg-zinc-800 rounded">1</kbd> Scene 1</span>
                    <span className="text-zinc-500">Live Stage + Streams</span>
                  </div>
                  <div className="flex justify-between p-2 bg-[#09090B] rounded text-white">
                    <span><kbd className="px-2 py-1 bg-zinc-800 rounded">2</kbd> Scene 2</span>
                    <span className="text-zinc-500">Timing Tower</span>
                  </div>
                  <div className="flex justify-between p-2 bg-[#09090B] rounded text-white">
                    <span><kbd className="px-2 py-1 bg-zinc-800 rounded">3</kbd> Scene 3</span>
                    <span className="text-zinc-500">Leaderboard</span>
                  </div>
                  <div className="flex justify-between p-2 bg-[#09090B] rounded text-white">
                    <span><kbd className="px-2 py-1 bg-zinc-800 rounded">4</kbd> Scene 4</span>
                    <span className="text-zinc-500">Pilot Focus</span>
                  </div>
                  <div className="flex justify-between p-2 bg-[#09090B] rounded text-white">
                    <span><kbd className="px-2 py-1 bg-zinc-800 rounded">5</kbd> Scene 5</span>
                    <span className="text-zinc-500">SS Comparison</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#18181B] border-zinc-800">
              <CardHeader>
                <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Data Management</CardTitle>
                <CardDescription className="text-zinc-400">Export or import your configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Button
                    onClick={handleExport}
                    variant="outline"
                    className="flex-1 border-zinc-700 text-white"
                    data-testid="button-export-config"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Configuration
                  </Button>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="flex-1 border-zinc-700 text-white"
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
                <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Current Summary</CardTitle>
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
                    <div className="text-sm text-zinc-500 mt-1">Active Streams</div>
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
