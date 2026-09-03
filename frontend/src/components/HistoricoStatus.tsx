'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api-client';
import { STATUS_LABEL } from '@/lib/request-status';
import type { HistoricoStatusItem } from '@/types/request';

interface HistoricoStatusProps {
  demandaId: string;
  /** Muda de valor a cada ação que altera o histórico (mudança de status, reatribuição) para forçar o refetch. */
  versao?: number;
}

export function HistoricoStatus({ demandaId, versao = 0 }: HistoricoStatusProps) {
  const [itens, setItens] = useState<HistoricoStatusItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(false);
    apiClient
      .request<HistoricoStatusItem[]>(`/demandas/${demandaId}/historico-status`, { auth: true })
      .then((lista) => {
        if (!cancelado) setItens(lista);
      })
      // Falha de rede/permissão não pode virar "não há histórico ainda": são coisas
      // diferentes para quem lê a tela.
      .catch(() => {
        if (!cancelado) setErro(true);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [demandaId, versao]);

  if (carregando) return <p className="text-sm text-gray-500">Carregando histórico…</p>;

  if (erro) {
    return <p className="text-sm text-red-600">Não foi possível carregar o histórico.</p>;
  }

  if (itens.length === 0) {
    return <p className="text-sm text-gray-500">Nenhuma mudança de status ainda.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {itens.map((item) => (
        <li key={item.id} className="rounded-xl border border-gray-200 p-3 text-sm">
          <p className="text-gray-900">
            <span className="font-medium">{item.usuarioNome}</span>{' '}
            {item.statusAnterior ? (
              <>
                mudou de <span className="font-medium">{STATUS_LABEL[item.statusAnterior]}</span> para{' '}
                <span className="font-medium">{STATUS_LABEL[item.statusNovo]}</span>
              </>
            ) : (
              <>
                mudou para <span className="font-medium">{STATUS_LABEL[item.statusNovo]}</span>
              </>
            )}
          </p>
          <p className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString('pt-BR')}</p>
          {item.observacao && <p className="mt-1 text-gray-700">{item.observacao}</p>}
        </li>
      ))}
    </ul>
  );
}
