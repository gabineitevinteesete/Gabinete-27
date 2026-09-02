'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import type { PublicUser } from '@/types/auth';

interface ReatribuirDemandaProps {
  demandaId: string;
  assessorAtualId: string;
  onReatribuido: (demanda: { id: string; assessorResponsavelId: string }) => void;
}

export function ReatribuirDemanda({ demandaId, assessorAtualId, onReatribuido }: ReatribuirDemandaProps) {
  const [assessores, setAssessores] = useState<PublicUser[]>([]);
  const [selecionadoId, setSelecionadoId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiClient
      .request<PublicUser[]>('/usuarios?ativo=true', { auth: true })
      .then((lista) => setAssessores(lista.filter((u) => u.id !== assessorAtualId)))
      .catch(() => setAssessores([]));
  }, [assessorAtualId]);

  async function confirmar() {
    if (!selecionadoId) return;
    setErro(null);
    setEnviando(true);
    try {
      const demanda = await apiClient.request<{ id: string; assessorResponsavelId: string }>(
        `/demandas/${demandaId}/reatribuir`,
        { method: 'PATCH', auth: true, body: { novoAssessorId: selecionadoId } },
      );
      onReatribuido(demanda);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível reatribuir. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="reatribuir-assessor" className="text-xs font-medium text-gray-600">
        Reatribuir para
      </label>
      <select
        id="reatribuir-assessor"
        value={selecionadoId}
        onChange={(e) => setSelecionadoId(e.target.value)}
        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">Selecione um assessor</option>
        {assessores.map((assessor) => (
          <option key={assessor.id} value={assessor.id}>
            {assessor.nome}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selecionadoId || enviando}
        onClick={confirmar}
        className="w-fit rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        Confirmar reatribuição
      </button>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
