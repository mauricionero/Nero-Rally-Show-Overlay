import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RallyProvider } from './contexts/RallyContext.jsx';
import { TranslationProvider } from './contexts/TranslationContext.jsx';
import Setup from './pages/Setup.jsx';
import Overlay from './pages/Overlay.jsx';
import Times from './pages/Times.jsx';
import { Toaster } from './components/ui/sonner';
import './App.css';

// Get basename from homepage in package.json for GitHub Pages
const basename = process.env.PUBLIC_URL || '';

function App() {
  useEffect(() => {
    const ignoredResizeObserverMessages = new Set([
      'ResizeObserver loop completed with undelivered notifications.',
      'ResizeObserver loop limit exceeded'
    ]);

    const handleWindowError = (event) => {
      const message = String(event?.message || '').trim();
      if (!ignoredResizeObserverMessages.has(message)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation?.();
    };

    window.addEventListener('error', handleWindowError);
    return () => {
      window.removeEventListener('error', handleWindowError);
    };
  }, []);

  return (
    <TranslationProvider>
      <RallyProvider>
        <BrowserRouter basename={basename}>
          <Routes>
            <Route path="/" element={<Setup />} />
            <Route path="/overlay" element={<Overlay />} />
            <Route path="/times" element={<Times />} />
          </Routes>
          <Toaster position="top-right" />
        </BrowserRouter>
      </RallyProvider>
    </TranslationProvider>
  );
}

export default App;
