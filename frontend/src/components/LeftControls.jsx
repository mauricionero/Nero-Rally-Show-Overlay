import React from 'react';
import ReactDOM from 'react-dom';

export const LeftControls = ({ children }) => {
  const container = document.getElementById('left-controls');
  
  if (!container) return null;
  
  return ReactDOM.createPortal(children, container);
};
