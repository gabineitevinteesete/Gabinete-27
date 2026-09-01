'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

export default function PainelPage() {
  const { user } = useAuth();

  return (
    <div className="rounded-card bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-primary-dark">Bem-vindo(a), {user?.nome}</h1>
      <p className="mt-2 text-sm text-gray-600">
        Registre e acompanhe as demandas do gabinete por aqui.
      </p>
      <Link
        href="/painel/demandas"
        className="mt-4 inline-block rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white"
      >
        Ver demandas
      </Link>
    </div>
  );
}
