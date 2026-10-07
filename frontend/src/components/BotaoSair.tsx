'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useFilaOffline } from '@/hooks/use-fila-offline';

/**
 * Encerra a sessão e volta para o login. Compartilhado pela Sidebar (desktop) e pela
 * MobileNav para que o comportamento de saída seja idêntico nos dois.
 */
export function BotaoSair({ className = '' }: { className?: string }) {
  const { logout } = useAuth();
  const { pendentes } = useFilaOffline();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function handleSair() {
    // As demandas guardadas no aparelho ficam salvas e saem quando o mesmo usuário entrar de novo.
    if (pendentes.length > 0) {
      const total = pendentes.length;
      const confirmou = window.confirm(
        `Há ${total} ${total === 1 ? 'demanda não enviada' : 'demandas não enviadas'} neste aparelho. Elas continuam salvas e serão enviadas quando você entrar de novo. Sair mesmo assim?`,
      );
      if (!confirmou) return;
    }
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
