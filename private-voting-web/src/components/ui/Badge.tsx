'use client';

import React from 'react';

interface BadgeProps {
  variant?: 'active' | 'pending' | 'tallying' | 'passed' | 'failed' | 'member' | 'default';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  active:   'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  pending:  'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  tallying: 'bg-[rgba(107,53,232,0.1)] text-[#a78bfa] border border-[rgba(107,53,232,0.3)]',
  passed:   'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  failed:   'bg-red-500/10 text-red-400 border border-red-500/30',
  member:   'bg-[rgba(107,53,232,0.1)] text-[#a78bfa] border border-[rgba(107,53,232,0.3)]',
  default:  'bg-white/5 text-[#888] border border-white/10',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 text-[10px] font-medium
        tracking-[0.12em] uppercase
        ${variants[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
