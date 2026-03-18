import React from 'react';
import { useRally } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import { Play, Wifi } from 'lucide-react';
import { getLocalOverlayUrl, getWebSocketOverlayUrl } from '../utils/overlayUrls.js';

// app version constant
import { VERSION } from '../config/version.js';

// Tab Components
import PilotsTab from '../components/setup/PilotsTab.jsx';
import CategoriesTab from '../components/setup/CategoriesTab.jsx';
import TheRaceTab from '../components/setup/TheRaceTab.jsx';
import BulkLoadTab from '../components/setup/BulkLoadTab.jsx';
import TimesTab from '../components/setup/TimesTab.jsx';
import StreamsTab from '../components/setup/StreamsTab.jsx';
import ConfigTab from '../components/setup/ConfigTab.jsx';
import DebugTab from '../components/setup/DebugTab.jsx';

export default function Setup() {
  const { t } = useTranslation();
  const { wsChannelKey, wsConnectionStatus } = useRally();
  const hasWebSocketOverlay = wsConnectionStatus === 'connected' && Boolean(wsChannelKey);

  const handleGoLive = (url) => {
    window.open(url, '_blank');
    toast.success('Overlay page opened in new tab');
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-white p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-5xl font-bold uppercase tracking-tighter text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {t('header.title')}
            </h1>
            <p className="text-zinc-400 mt-2">{t('header.subtitle')}</p>
          </div>
          
          <div className="flex flex-col items-end gap-1">
            <div className="rounded-xl border border-zinc-800 bg-[#18181B] p-2">
              <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                {t('header.goLive')}
              </div>
              <TooltipProvider delayDuration={150}>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleGoLive(getLocalOverlayUrl())}
                    className="min-w-[138px] bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold"
                    data-testid="go-to-overlay-button"
                  >
                    <Play className="w-4 h-4" />
                    {t('header.local')}
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex">
                        <Button
                          onClick={() => handleGoLive(getWebSocketOverlayUrl(wsChannelKey))}
                          disabled={!hasWebSocketOverlay}
                          className={hasWebSocketOverlay
                            ? 'min-w-[138px] bg-[#FF4500] hover:bg-[#FF4500]/90 text-white uppercase font-bold disabled:opacity-100'
                            : 'min-w-[138px] bg-zinc-800 hover:bg-zinc-800 text-zinc-400 uppercase font-bold disabled:opacity-100'
                          }
                          data-testid="go-to-websocket-overlay-button"
                        >
                          <Wifi className="w-4 h-4" />
                          {t('header.websocket')}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[260px] bg-zinc-900 text-zinc-100">
                      {hasWebSocketOverlay ? t('header.websocketReadyHint') : t('header.websocketSetupHint')}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
            {/* version tag */}
            <div className="text-xs text-zinc-500">v{VERSION}</div>
          </div>
        </div>

        <Tabs defaultValue="pilots" className="space-y-6">
          <TabsList className="bg-[#18181B] border border-zinc-800">
            <TabsTrigger value="pilots" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-pilots">{t('tabs.pilots')}</TabsTrigger>
            <TabsTrigger value="categories" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-categories">{t('tabs.categories')}</TabsTrigger>
            <TabsTrigger value="therace" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-therace">{t('tabs.theRace')}</TabsTrigger>
            <TabsTrigger value="times" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-times">{t('tabs.times')}</TabsTrigger>
            <TabsTrigger value="streams" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-streams">{t('tabs.streams')}</TabsTrigger>
            <TabsTrigger value="bulkload" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-bulkload">{t('tabs.bulkLoad')}</TabsTrigger>
            <TabsTrigger value="config" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-config">{t('tabs.config')}</TabsTrigger>
            <TabsTrigger value="debug" className="text-white data-[state=active]:bg-[#FF4500]" data-testid="tab-debug">{t('tabs.debug')}</TabsTrigger>
          </TabsList>

          <TabsContent value="pilots">
            <PilotsTab />
          </TabsContent>

          <TabsContent value="categories">
            <CategoriesTab />
          </TabsContent>

          <TabsContent value="therace">
            <TheRaceTab />
          </TabsContent>

          <TabsContent value="times">
            <TimesTab />
          </TabsContent>

          <TabsContent value="streams">
            <StreamsTab />
          </TabsContent>

          <TabsContent value="bulkload">
            <BulkLoadTab />
          </TabsContent>

          <TabsContent value="config">
            <ConfigTab />
          </TabsContent>

          <TabsContent value="debug">
            <DebugTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
