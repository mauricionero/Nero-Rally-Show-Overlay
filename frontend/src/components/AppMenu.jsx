import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Home, MonitorPlay, Clock3 } from 'lucide-react';
import { Button } from './ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from './ui/sheet';
import { useTranslation } from '../contexts/TranslationContext.jsx';

const navigationItems = [
  { path: '/', label: 'Setup', icon: Home },
  { path: '/overlay', label: 'Overlay', icon: MonitorPlay },
  { path: '/times', label: 'Times', icon: Clock3 }
];

export default function AppMenu() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleNavigate = (path) => {
    if (location.pathname !== path) {
      navigate(path);
    }
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="fixed left-2 top-2 z-50 bg-[#111113]/90 text-white border border-zinc-800 shadow-lg shadow-black/35 backdrop-blur hover:bg-[#18181B]"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] border-zinc-800 bg-[#111113] p-0 text-white">
        <div className="flex h-full flex-col p-6">
          <SheetHeader className="text-left">
            <SheetTitle className="text-left text-xl uppercase tracking-tighter text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              {t('header.title')}
            </SheetTitle>
            <SheetDescription className="text-left text-zinc-400">
              Quick navigation between pages
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;

              return (
                <Button
                  key={item.path}
                  type="button"
                  variant={active ? 'default' : 'ghost'}
                  className={`w-full justify-start gap-3 ${active ? 'bg-[#FF4500] text-white hover:bg-[#FF4500]/90' : 'text-zinc-200 hover:bg-zinc-800 hover:text-white'}`}
                  onClick={() => handleNavigate(item.path)}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-semibold uppercase tracking-wide">{item.label}</span>
                </Button>
              );
            })}
          </div>

          <div className="mt-auto rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-400">
            {t('header.title')}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
