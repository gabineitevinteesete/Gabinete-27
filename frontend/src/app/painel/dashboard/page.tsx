'use client';

import { useAuth } from '@/hooks/use-auth';
import { ResumoDashboard } from '@/components/ResumoDashboard';
import { ProdutividadeAssessores } from '@/components/ProdutividadeAssessores';

export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role !== 'CHEFE') {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Dashboard</h1>
      <ResumoDashboard />
      <ProdutividadeAssessores />
    </div>
  );
}
