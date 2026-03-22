'use client';

import React, { useState } from 'react';
import { Shield, Lock, Cpu, BarChart3, ChevronDown } from 'lucide-react';

const steps = [
  {
    icon: Lock,
    title: 'Vote Encrypted in Browser',
    description:
      'Your vote (Yes / No / Abstain) is encrypted client-side using X25519 key exchange with the Arcium MXE public key before it ever leaves your browser.',
  },
  {
    icon: Shield,
    title: 'Ciphertext Stored On-Chain',
    description:
      'Only the encrypted vote is written to Solana. The plaintext value is never stored anywhere — not even validators can read it.',
  },
  {
    icon: Cpu,
    title: 'Arcium TEE Tallies Privately',
    description:
      'After voting ends, a tally is triggered. Arcium\'s Trusted Execution Environment runs the tally circuit over all encrypted votes inside a secure enclave — no individual vote is ever decrypted.',
  },
  {
    icon: BarChart3,
    title: 'Only Aggregates Published',
    description:
      'The TEE writes only the final counts (Yes / No / Abstain) back on-chain. Individual votes remain private forever.',
  },
];

export function HowItWorks() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-[rgba(107,53,232,0.2)] bg-[#080808]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-[#6B35E8]">
          <Shield className="w-3.5 h-3.5" />
          How Arcium Privacy Works
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#555] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-[rgba(107,53,232,0.15)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="flex gap-3">
                  <div className="shrink-0 mt-0.5">
                    <div className="w-6 h-6 flex items-center justify-center bg-[rgba(107,53,232,0.1)] border border-[rgba(107,53,232,0.25)]">
                      <Icon className="w-3 h-3 text-[#6B35E8]" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-white tracking-wide mb-0.5">
                      {i + 1}. {step.title}
                    </p>
                    <p className="text-[11px] text-[#666] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-[rgba(107,53,232,0.1)] flex items-center justify-between text-[10px] text-[#444] tracking-widest uppercase">
            <span>Powered by Arcium TEE · arcium-anchor 0.9.2</span>
            <a
              href="https://arcium.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#6B35E8] hover:text-[#a78bfa] transition-colors"
            >
              Learn more →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
