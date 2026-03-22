'use client';

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'yes' | 'no' | 'abstain';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  arrow?: boolean;
}

const variantClasses = {
  primary:
    'bg-[#6B35E8] hover:bg-[#7B45F8] text-white border border-[#6B35E8]',
  secondary:
    'bg-transparent hover:bg-[rgba(107,53,232,0.08)] text-white border border-[rgba(255,255,255,0.15)] hover:border-[rgba(107,53,232,0.4)]',
  danger:
    'bg-transparent hover:bg-red-500/10 text-red-400 border border-red-500/40 hover:border-red-500/70',
  ghost:
    'bg-transparent hover:bg-white/5 text-[#888] hover:text-white border border-transparent',
  yes:
    'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/50',
  no:
    'bg-red-600 hover:bg-red-500 text-white border border-red-500/50',
  abstain:
    'bg-transparent hover:bg-white/5 text-[#888] hover:text-white border border-[rgba(255,255,255,0.1)]',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-xs',
  lg: 'px-6 py-2.5 text-xs',
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  arrow = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center justify-center gap-2 font-medium
        tracking-[0.1em] uppercase transition-all duration-150 cursor-pointer
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
      {arrow && !isLoading && (
        <span className="text-[0.9em] opacity-70">&gt;&gt;</span>
      )}
    </button>
  );
}
