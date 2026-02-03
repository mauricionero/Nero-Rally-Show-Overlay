import React from 'react';
import { useRally } from '../contexts/RallyContext.jsx';

export const CategoryBadge = ({ categoryId, className = '' }) => {
  const { categories } = useRally();
  const category = categories.find(c => c.id === categoryId);
  
  if (!category) return null;
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div 
        className="w-1 h-full" 
        style={{ backgroundColor: category.color }}
      />
      <span 
        className="text-xs uppercase font-bold"
        style={{ color: category.color }}
      >
        {category.name}
      </span>
    </div>
  );
};

export const CategoryBar = ({ categoryId }) => {
  const { categories } = useRally();
  const category = categories.find(c => c.id === categoryId);
  
  if (!category) return null;
  
  return (
    <div 
      className="w-1 h-full absolute left-0 top-0"
      style={{ backgroundColor: category.color }}
    />
  );
};
