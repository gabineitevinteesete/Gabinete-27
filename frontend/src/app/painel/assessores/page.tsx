'use client';

import { useAuth } from '@/hooks/use-auth';
import { ListaAssessores } from '@/components/ListaAssessores';

export default function AssessoresPage() {
  const { user } = useAuth();

  if (user?.role !== 'CHEFE') {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Assessores</h1>
      <ListaAssessores />
    </div>
  );
}
