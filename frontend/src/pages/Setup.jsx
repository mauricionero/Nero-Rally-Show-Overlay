import React from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Play, Palette } from 'lucide-react';

// Tab Components
import PilotsTab from '../components/setup/PilotsTab.jsx';
import CategoriesTab from '../components/setup/CategoriesTab.jsx';
import StagesTab from '../components/setup/StagesTab.jsx';
import TimesTab from '../components/setup/TimesTab.jsx';
import StreamsTab from '../components/setup/StreamsTab.jsx';
import ConfigTab from '../components/setup/ConfigTab.jsx';

const CHROMA_PRESETS = [
  { name: 'Black', value: '#000000', label: 'K' },
  { name: 'Green Screen', value: '#00B140', label: 'G' },
  { name: 'Blue Screen', value: '#0047BB', label: 'B' }
];

export default function Setup() {
  const { chromaKey, setChromaKey } = useRally();
  const [customChroma, setCustomChroma] = React.useState('#000000');

  const handleGoLive = () => {
    const basePath = process.env.PUBLIC_URL || '';
    window.open(`${basePath}/overlay`, '_blank');
    toast.success('Overlay page opened in new tab');
  };

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
            <TabsTrigger value="pilots" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-pilots">Pilots</TabsTrigger>
            <TabsTrigger value="categories" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-categories">Categories</TabsTrigger>
            <TabsTrigger value="stages" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-stages">Stages</TabsTrigger>
            <TabsTrigger value="times" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-times">Times</TabsTrigger>
            <TabsTrigger value="streams" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-streams">Streams</TabsTrigger>
            <TabsTrigger value="config" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-config">Config</TabsTrigger>
          </TabsList>

          <TabsContent value="pilots">
            <PilotsTab />
          </TabsContent>

          <TabsContent value="categories">
            <CategoriesTab />
          </TabsContent>

          <TabsContent value="stages">
            <StagesTab />
          </TabsContent>

          <TabsContent value="times">
            <TimesTab />
          </TabsContent>

          <TabsContent value="streams">
            <StreamsTab />
          </TabsContent>

          <TabsContent value="config">
            <ConfigTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
