import React, { useRef, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { toast } from 'sonner';
import { Upload, Download, Wifi, WifiOff, Copy, Check, Map, Image } from 'lucide-react';

export default function ConfigTab() {
  const {
    pilots,
    categories,
    stages,
    mapUrl,
    setMapUrl,
    logoUrl,
    setLogoUrl,
    exportData,
    importData,
    clearAllData,
    // WebSocket
    wsEnabled,
    wsChannelKey,
    wsConnectionStatus,
    wsError,
    connectWebSocket,
    disconnectWebSocket,
    generateNewChannelKey
  } = useRally();

  const fileInputRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [newKey, setNewKey] = useState('');

  const activePilots = pilots.filter(p => p.isActive);

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

  const handleGenerateKey = () => {
    const key = generateNewChannelKey();
    setNewKey(key);
    toast.success('New channel key generated');
  };

  const handleConnect = async () => {
    if (!newKey.trim()) {
      toast.error('Please generate or enter a channel key');
      return;
    }
    const success = await connectWebSocket(newKey);
    if (success) {
      toast.success('Connected to WebSocket channel');
    } else {
      toast.error('Failed to connect: ' + (wsError || 'Unknown error'));
    }
  };

  const handleCopyKey = () => {
    const keyToCopy = wsChannelKey || newKey;
    if (keyToCopy) {
      navigator.clipboard.writeText(keyToCopy);
      setCopied(true);
      toast.success('Channel key copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyOverlayUrl = () => {
    const basePath = process.env.PUBLIC_URL || '';
    const key = wsChannelKey || newKey;
    const url = `${window.location.origin}${basePath}/overlay?ws=${encodeURIComponent(key)}`;
    navigator.clipboard.writeText(url);
    toast.success('Overlay URL with key copied!');
  };

  return (
    <div className="space-y-4">
      {/* Google Maps URL */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Map className="w-5 h-5" />
            Google Maps Integration
          </CardTitle>
          <CardDescription className="text-zinc-400">Add a Google Maps embed URL to display in Scene 1 grid</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label className="text-white">Google Maps Embed URL</Label>
            <Input
              value={mapUrl || ''}
              onChange={(e) => setMapUrl(e.target.value)}
              placeholder="https://www.google.com/maps/embed?pb=..."
              className="bg-[#09090B] border-zinc-700 text-white font-mono text-sm"
              data-testid="input-map-url"
            />
            <p className="text-xs text-zinc-500">
              Tip: Go to Google Maps → Share → Embed a map → Copy the src URL from the iframe code
            </p>
          </div>
        </CardContent>
      </Card>

      {/* WebSocket Live Sync */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {wsConnectionStatus === 'connected' ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-zinc-500" />}
            Live Sync (WebSocket)
          </CardTitle>
          <CardDescription className="text-zinc-400">Real-time sync between Setup and Overlay pages across devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              wsConnectionStatus === 'connected' ? 'bg-green-500' :
              wsConnectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              wsConnectionStatus === 'error' ? 'bg-red-500' : 'bg-zinc-500'
            }`} />
            <span className="text-white capitalize">{wsConnectionStatus}</span>
            {wsError && <span className="text-red-400 text-sm">({wsError})</span>}
          </div>

          {wsConnectionStatus === 'connected' ? (
            <div className="space-y-3">
              <div className="bg-[#09090B] p-3 rounded border border-zinc-700">
                <Label className="text-xs text-zinc-400 block mb-1">Connected Channel Key</Label>
                <div className="flex items-center gap-2">
                  <code className="text-[#FACC15] font-mono flex-1 truncate">{wsChannelKey}</code>
                  <Button variant="ghost" size="icon" onClick={handleCopyKey} className="h-8 w-8">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-zinc-400" />}
                  </Button>
                </div>
              </div>
              <Button
                onClick={handleCopyOverlayUrl}
                variant="outline"
                className="w-full border-zinc-700 text-white"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Overlay URL with Key
              </Button>
              <Button
                onClick={disconnectWebSocket}
                variant="destructive"
                className="w-full"
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Enter or generate a channel key"
                  className="bg-[#09090B] border-zinc-700 text-white font-mono"
                />
                <Button onClick={handleGenerateKey} variant="outline" className="border-zinc-700 text-white shrink-0">
                  Generate
                </Button>
              </div>
              <Button
                onClick={handleConnect}
                disabled={!newKey.trim() || wsConnectionStatus === 'connecting'}
                className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90"
              >
                {wsConnectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keyboard Shortcuts */}
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

      {/* Data Management */}
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

      {/* Current Summary */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Current Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-[#09090B] p-4 rounded">
              <div className="text-3xl font-bold text-[#FF4500]">{pilots.length}</div>
              <div className="text-sm text-zinc-400">Pilots</div>
            </div>
            <div className="bg-[#09090B] p-4 rounded">
              <div className="text-3xl font-bold text-[#FF4500]">{categories.length}</div>
              <div className="text-sm text-zinc-400">Categories</div>
            </div>
            <div className="bg-[#09090B] p-4 rounded">
              <div className="text-3xl font-bold text-[#FF4500]">{stages.length}</div>
              <div className="text-sm text-zinc-400">Stages</div>
            </div>
            <div className="bg-[#09090B] p-4 rounded">
              <div className="text-3xl font-bold text-[#22C55E]">{activePilots.length}</div>
              <div className="text-sm text-zinc-400">Active Streams</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
