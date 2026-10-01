'use client';

import { useAuth } from '@/hooks/use-auth';
import { BuscaCidadao } from '@/components/BuscaCidadao';

export default function PrivacidadePage() {
  const { user } = useAuth();

  if (user?.role !== 'CHEFE') {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Privacidade</h1>
      <p className="text-sm text-gray-600">
        Busque as demandas de um cidadão pelo telefone para anonimizar os dados pessoais, a pedido dele.
      </p>
      <BuscaCidadao />
    </div>
  );
}
