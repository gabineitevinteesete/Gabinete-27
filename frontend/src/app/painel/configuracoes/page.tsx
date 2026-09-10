'use client';

import { useAuth } from '@/hooks/use-auth';
import { ListaTiposDemanda } from '@/components/ListaTiposDemanda';

export default function ConfiguracoesPage() {
  const { user } = useAuth();

  if (user?.role !== 'CHEFE') {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Configurações</h1>
      <ListaTiposDemanda />
    </div>
  );
}
