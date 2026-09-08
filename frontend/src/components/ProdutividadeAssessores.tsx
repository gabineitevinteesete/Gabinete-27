'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api-client';
import { STATUS_LABEL } from '@/lib/request-status';
import type { ProdutividadeAssessor, RequestStatusValue } from '@/types/request';

function mesAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

const ORDEM_STATUS: RequestStatusValue[] = [
  'ENVIADA', 'RECEBIDA', 'EM_CONFERENCIA', 'PENDENTE_INFORMACAO',
  'PROTOCOLADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'ARQUIVADA', 'RECUSADA',
];

export function ProdutividadeAssessores() {
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<ProdutividadeAssessor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setCarregando(true);
    setErro(false);
    apiClient
      .request<ProdutividadeAssessor[]>(`/dashboard/produtividade-assessores?mes=${mes}`, { auth: true })
      .then(setDados)
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, [mes]);

  return (
    <div className="rounded-card bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary-dark">Produtividade dos assessores de rua</h2>
        <div>
          <label htmlFor="mes-produtividade" className="mr-2 text-xs font-medium text-gray-600">
            Mês
          </label>
          <input
            id="mes-produtividade"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded-xl border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {carregando && <p className="text-sm text-gray-500">Carregando…</p>}
      {erro && <p className="text-sm text-red-600">Não foi possível carregar a produtividade.</p>}
      {!carregando && !erro && dados.length === 0 && (
        <p className="text-sm text-gray-500">Nenhum assessor de rua ativo.</p>
      )}

      {!carregando && !erro && dados.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-600">
                <th className="py-2 pr-3">Assessor</th>
                {ORDEM_STATUS.map((status) => (
                  <th key={status} className="px-2 py-2 text-right">{STATUS_LABEL[status]}</th>
                ))}
                <th className="py-2 pl-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((assessor) => (
                <tr key={assessor.assessorId} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-medium text-gray-900">{assessor.assessorNome}</td>
                  {ORDEM_STATUS.map((status) => (
                    <td key={status} className="px-2 py-2 text-right text-gray-700">{assessor.porStatus[status]}</td>
                  ))}
                  <td className="py-2 pl-3 text-right font-medium text-gray-900">{assessor.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
