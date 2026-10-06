'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiClient, ApiError } from '@/services/api-client';

function dataLocal(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

// `filtros` é a query string dos filtros aplicados na lista (sem paginação).
export function ExportarDemandas({ filtros }: { filtros: string }) {
  const { user } = useAuth();
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (user?.role !== 'CHEFE') return null;

  async function exportar() {
    setExportando(true);
    setErro(null);
    try {
      const blob = await apiClient.requestBlob(`/demandas/exportar${filtros ? `?${filtros}` : ''}`, { auth: true });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `demandas-${dataLocal()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível exportar. Tente novamente.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={exportar}
        disabled={exportando}
        className="w-fit rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary-dark hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exportando ? 'Exportando…' : 'Exportar planilha'}
      </button>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
