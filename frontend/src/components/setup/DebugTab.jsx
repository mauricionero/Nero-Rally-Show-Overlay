import React from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Bug, CalendarDays } from 'lucide-react';

export default function DebugTab() {
  const { t } = useTranslation();
  const { debugDate, setDebugDate } = useRally();

  return (
    <div className="space-y-4">
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Bug className="w-5 h-5" />
            {t('debug.title')}
          </CardTitle>
          <CardDescription className="text-zinc-400">
            {t('debug.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white">{t('debug.simulatedDate')}</Label>
            <Input
              type="date"
              value={debugDate || ''}
              onChange={(e) => setDebugDate(e.target.value)}
              className="bg-[#09090B] border-zinc-700 text-white"
              data-testid="input-debug-date"
            />
            <p className="text-xs text-zinc-500">{t('debug.help')}</p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setDebugDate('')}
              variant="outline"
              className="border-zinc-700 text-white"
              disabled={!debugDate}
            >
              {t('debug.clearDebugDate')}
            </Button>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <CalendarDays className="w-4 h-4" />
              <span>
                {debugDate ? `${t('debug.activeDate')}: ${debugDate}` : t('debug.usingRealDate')}
              </span>
            </div>
          </div>

          <p className="text-xs text-zinc-500">{t('debug.syncNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
