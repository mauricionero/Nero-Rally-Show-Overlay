import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RallyProvider } from './contexts/RallyContext';
import Setup from './pages/Setup';
import Overlay from './pages/Overlay';
import { Toaster } from './components/ui/sonner';
import './App.css';

function App() {
  return (
    <RallyProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Setup />} />
          <Route path="/overlay" element={<Overlay />} />
        </Routes>
        <Toaster position="top-right" />
      </BrowserRouter>
    </RallyProvider>
  );
}

export default App;
