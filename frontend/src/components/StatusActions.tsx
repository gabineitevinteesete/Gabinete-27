'use client';

import { useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { TRANSICOES_VALIDAS, ACAO_LABEL, exigeMotivo } from '@/lib/request-status';
import type { RequestStatusValue } from '@/types/request';

interface StatusActionsProps {
  demandaId: string;
  statusAtual: RequestStatusValue;
  onStatusAlterado: (demanda: { id: string; status: RequestStatusValue }) => void;
}

export function StatusActions({ demandaId, statusAtual, onStatusAlterado }: StatusActionsProps) {
  const [transicaoPendente, setTransicaoPendente] = useState<RequestStatusValue | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const transicoes = TRANSICOES_VALIDAS[statusAtual];

  async function confirmar(novoStatus: RequestStatusValue, motivoInformado?: string) {
    setErro(null);
    setEnviando(true);
    try {
      const demanda = await apiClient.request<{ id: string; status: RequestStatusValue }>(
        `/demandas/${demandaId}/status`,
        { method: 'PATCH', auth: true, body: { novoStatus, motivo: motivoInformado } },
      );
      setTransicaoPendente(null);
      setMotivo('');
      onStatusAlterado(demanda);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível mudar o status. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  function clicarAcao(novoStatus: RequestStatusValue) {
    if (exigeMotivo(novoStatus)) {
      setErro(null);
      setTransicaoPendente(novoStatus);
      return;
    }
    void confirmar(novoStatus);
  }

  function confirmarComMotivo() {
    if (!transicaoPendente || !motivo.trim()) return;
    void confirmar(transicaoPendente, motivo.trim());
  }

  if (transicoes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {transicoes.map((novoStatus) => (
          <button
            key={novoStatus}
            type="button"
            disabled={enviando}
            onClick={() => clicarAcao(novoStatus)}
            className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ACAO_LABEL[novoStatus]}
          </button>
        ))}
      </div>

      {transicaoPendente && (
        <div className="flex flex-col gap-2 rounded-xl border border-gray-300 p-3">
          <label htmlFor="motivo-transicao" className="text-sm font-medium text-gray-700">
            Motivo
          </label>
          <textarea
            id="motivo-transicao"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={enviando || !motivo.trim()}
              onClick={confirmarComMotivo}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                setTransicaoPendente(null);
                setMotivo('');
              }}
              className="rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
