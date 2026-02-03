import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RallyProvider } from './contexts/RallyContext.jsx';
import Setup from './pages/Setup.jsx';
import Overlay from './pages/Overlay.jsx';
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
