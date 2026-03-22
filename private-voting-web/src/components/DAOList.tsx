'use client';

import React, { useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useVotingStore } from '@/store/votingStore';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { CreateDAOModal } from './CreateDAOModal';
import { Plus, Users, FileText, Shield } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { DaoAccount } from '@/types/voting';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require('bs58') as { encode: (buf: Uint8Array) => string };

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'VotEjnN5K9bxPZBk6WBEGcwcDdnADLUMBRZCKsFgUkP'
);

export function DAOList() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { daos, setDaos, setView, isLoading, setLoading } = useVotingStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadDaos = async () => {
    setLoading(true);
    try {
      // Fetch all accounts owned by program with DaoAccount discriminator
      // Discriminator for DaoAccount — sha256("account:DaoAccount")[0..8]
      const discriminator = Buffer.from([174, 58, 100, 153, 105, 117, 66, 171]);
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 0, bytes: bs58.encode(discriminator) } },
        ],
      });

      const parsed: DaoAccount[] = accounts.map(({ pubkey, account }) => {
        const data = account.data;
        let offset = 8; // skip discriminator

        const authority = new PublicKey(data.slice(offset, offset + 32)).toBase58(); offset += 32;
        const daoId = data.readBigUInt64LE(offset); offset += 8;
        const nameLen = data.readUInt32LE(offset); offset += 4;
        const name = data.slice(offset, offset + nameLen).toString('utf8'); offset += nameLen;
        const descLen = data.readUInt32LE(offset); offset += 4;
        const description = data.slice(offset, offset + descLen).toString('utf8'); offset += descLen;
        const memberCount = data.readUInt32LE(offset); offset += 4;
        const proposalCount = data.readBigUInt64LE(offset); offset += 8;
        const quorumPercentage = data.readUInt8(offset); offset += 1;
        const passThreshold = data.readUInt8(offset); offset += 1;
        const votingPeriodSecs = data.readBigInt64LE(offset); offset += 8;
        const bump = data.readUInt8(offset);

        return {
          publicKey: pubkey.toBase58(),
          authority,
          daoId,
          name,
          description,
          memberCount,
          proposalCount,
          quorumPercentage,
          passThreshold,
          votingPeriodSecs,
          bump,
        };
      });

      setDaos(parsed);
    } catch (err) {
      console.error('Failed to load DAOs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDaos();
  }, [connection]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">DAOs</h1>
          <p className="text-slate-500 text-sm mt-0.5">Privacy-preserving governance on Solana</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} disabled={!publicKey}>
          <Plus className="w-4 h-4" />
          New DAO
        </Button>
      </div>

      {/* Privacy callout */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-violet-500/5 border border-violet-500/15 text-sm text-violet-300">
        <Shield className="w-5 h-5 shrink-0" />
        <span>
          All votes are encrypted with Arcium before being stored on-chain. Only aggregate
          tallies are ever revealed.
        </span>
      </div>

      {/* DAO grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#111118] border border-violet-500/10 rounded-xl p-5 h-36 animate-pulse" />
          ))}
        </div>
      ) : daos.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-slate-500 text-sm">No DAOs yet. Create the first one!</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {daos.map((dao) => (
            <Card
              key={dao.publicKey}
              hover
              onClick={() => setView('dao', dao.publicKey)}
              className="space-y-3"
            >
              <div>
                <h3 className="text-slate-100 font-semibold">{dao.name}</h3>
                {dao.description && (
                  <p className="text-slate-500 text-xs mt-1 line-clamp-2">{dao.description}</p>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {dao.memberCount} member{dao.memberCount !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  {dao.proposalCount.toString()} proposal{dao.proposalCount !== 1n ? 's' : ''}
                </span>
              </div>

              <div className="text-xs text-slate-600">
                {dao.passThreshold}% to pass · {dao.quorumPercentage}% quorum
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateDAOModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadDaos}
        />
      )}
    </div>
  );
}
