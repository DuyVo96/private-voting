import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { NavBar } from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'PrivateVote — Privacy-preserving DAO Governance',
  description:
    'Cast encrypted votes on Solana. Arcium TEE tallies privately — only aggregate counts are ever revealed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black">
        <Providers>
          <NavBar />
          <main className="pt-16">{children}</main>
          <footer className="text-center py-6 text-[#444] text-[11px] tracking-widest uppercase">
            Made by{' '}
            <a
              href="https://x.com/HunterGuy102"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#6B35E8] hover:text-[#a78bfa] transition-colors"
            >
              @HunterGuy102
            </a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
