'use client';

import { useEffect } from 'react';
import { WalletContextProvider } from './WalletContextProvider';
import { AuthProvider } from '@/contexts/AuthContext';

// Suppress "Plugin Closed" wallet-dismiss noise from the Next.js dev overlay
function SuppressWalletDismissErrors() {
  useEffect(() => {
    const orig = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('Plugin Closed')) return;
      if (args[0] instanceof Error && args[0].message?.includes('Plugin Closed')) return;
      if (typeof args[0] === 'string' && args[0].includes('429')) return;
      if (args[0] instanceof Error && args[0].message?.includes('429')) return;
      orig(...args);
    };
    return () => { console.error = orig; };
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletContextProvider>
      <SuppressWalletDismissErrors />
      <AuthProvider>{children}</AuthProvider>
    </WalletContextProvider>
  );
}
