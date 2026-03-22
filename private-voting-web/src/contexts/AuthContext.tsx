'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

interface AuthContextType {
  isConnected: boolean;
  walletAddress: string | null;
  balance: number | null;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isConnected: false,
  walletAddress: null,
  balance: null,
  refresh: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connected) {
      setBalance(null);
      return;
    }
    try {
      const bal = await connection.getBalance(publicKey);
      setBalance(bal / 1e9);
    } catch {
      setBalance(null);
    }
  }, [publicKey, connected, connection]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return (
    <AuthContext.Provider
      value={{
        isConnected: connected && !!publicKey,
        walletAddress: publicKey?.toBase58() ?? null,
        balance,
        refresh: fetchBalance,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
