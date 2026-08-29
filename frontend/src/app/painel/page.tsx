'use client';

import { useAuth } from '@/hooks/use-auth';

export default function PainelPage() {
  const { user } = useAuth();

  return (
    <div className="rounded-card bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-primary-dark">Bem-vindo(a), {user?.nome}</h1>
      <p className="mt-2 text-sm text-gray-600">
        O painel de demandas será construído na próxima fase. Por enquanto, esta é a área
        protegida do sistema — só usuários autenticados chegam até aqui.
      </p>
    </div>
  );
}
