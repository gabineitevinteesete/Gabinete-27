'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api-client';
import { STATUS_LABEL } from '@/lib/request-status';
import type { HistoricoStatusItem } from '@/types/request';

export function HistoricoStatus({ demandaId }: { demandaId: string }) {
  const [itens, setItens] = useState<HistoricoStatusItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    apiClient
      .request<HistoricoStatusItem[]>(`/demandas/${demandaId}/historico-status`, { auth: true })
      .then(setItens)
      .catch(() => setItens([]))
      .finally(() => setCarregando(false));
  }, [demandaId]);

  if (carregando) return <p className="text-sm text-gray-500">Carregando histórico…</p>;

  if (itens.length === 0) {
    return <p className="text-sm text-gray-500">Nenhuma mudança de status ainda.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {itens.map((item) => (
        <li key={item.id} className="rounded-xl border border-gray-200 p-3 text-sm">
          <p className="text-gray-900">
            <span className="font-medium">{item.usuarioNome}</span> mudou para{' '}
            <span className="font-medium">{STATUS_LABEL[item.statusNovo]}</span>
          </p>
          <p className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString('pt-BR')}</p>
          {item.observacao && <p className="mt-1 text-gray-700">{item.observacao}</p>}
        </li>
      ))}
    </ul>
  );
}
