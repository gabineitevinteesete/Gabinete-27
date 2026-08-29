'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

/**
 * Encerra a sessão e volta para o login. Compartilhado pela Sidebar (desktop) e pela
 * MobileNav para que o comportamento de saída seja idêntico nos dois.
 */
export function BotaoSair({ className = '' }: { className?: string }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function handleSair() {
    setSaindo(true);
    try {
      await logout();
    } finally {
      router.push('/login');
    }
  }

  return (
    <button type="button" onClick={handleSair} disabled={saindo} className={className}>
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
  );
}
