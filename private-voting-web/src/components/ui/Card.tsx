'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className = '', onClick, hover }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        arc-bracket
        bg-[#080808] border border-[rgba(107,53,232,0.2)] p-5
        ${hover ? 'hover:border-[rgba(107,53,232,0.5)] hover:bg-[#0a0a0a] cursor-pointer transition-all duration-150' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
