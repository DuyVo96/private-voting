'use client';

import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useVotingStore } from '@/store/votingStore';

function ArciumLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 2L20 18H2L11 2Z" stroke="#6B35E8" strokeWidth="1.5" fill="none" />
      <path d="M11 7L16.5 17H5.5L11 7Z" fill="#6B35E8" fillOpacity="0.35" />
    </svg>
  );
}

export function NavBar() {
  const { currentView, setView } = useVotingStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[rgba(107,53,232,0.2)] bg-black/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-6 text-sm">
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-2.5 group"
          >
            <ArciumLogo />
            <span className="text-white font-semibold tracking-[0.12em] uppercase text-xs">
              Arcium
            </span>
            <span className="text-[rgba(107,53,232,0.5)] font-light">|</span>
            <span className="text-[#888] tracking-[0.08em] uppercase text-xs group-hover:text-white transition-colors">
              PrivateVote
            </span>
          </button>

          {currentView === 'proposal' && (
            <span className="hidden sm:flex items-center gap-2 text-[#888] text-xs tracking-arcium uppercase">
              <span className="text-[#6B35E8]">&gt;&gt;</span>
              Proposal
            </span>
          )}
        </div>

        {/* Wallet */}
        {mounted && (
          <WalletMultiButton
            style={{
              background: 'rgba(107, 53, 232, 0.12)',
              border: '1px solid rgba(107, 53, 232, 0.4)',
              borderRadius: '0',
              padding: '6px 16px',
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#c4b5fd',
              height: 'auto',
              fontFamily: 'inherit',
            }}
          />
        )}
      </div>
    </nav>
  );
}
