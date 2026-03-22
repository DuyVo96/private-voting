'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Shield, Lock, Eye } from 'lucide-react';

export function PrivacyExplainer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-violet-500/20 rounded-xl overflow-hidden bg-violet-500/5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-violet-300 hover:text-violet-200 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium">
          <Shield className="w-4 h-4" />
          How Arcium protects your vote
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="px-4 pb-4 text-sm text-slate-400 space-y-3 border-t border-violet-500/10">
          <div className="flex gap-3 pt-3">
            <Lock className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-slate-300 font-medium mb-0.5">Your vote is encrypted on-chain</p>
              <p>
                Before submission, your vote (Yes/No/Abstain) is encrypted client-side using
                x25519 Diffie-Hellman + RescueCipher. Only the ciphertext is stored on Solana —
                nobody can read it.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Shield className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-slate-300 font-medium mb-0.5">Arcium TEE tallies privately</p>
              <p>
                When voting ends, the tally computation runs inside Arcium&apos;s Trusted Execution
                Environment (TEE). The circuit decrypts each vote and counts Yes/No/Abstain —
                but outputs only the aggregated counts. No individual vote is ever revealed, not
                even to the tally caller.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Eye className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-slate-300 font-medium mb-0.5">Only the final count is public</p>
              <p>
                After the TEE computation completes, it emits a callback to the Solana program
                with the aggregate result (yes, no, abstain). This is the only information
                permanently recorded on-chain.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
