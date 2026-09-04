'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { useAuth } from '@/hooks/use-auth';
import type { ObservacaoInterna } from '@/types/request';

export function ObservacoesInternas({ demandaId }: { demandaId: string }) {
  const { user } = useAuth();
  const [observacoes, setObservacoes] = useState<ObservacaoInterna[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [textoNovo, setTextoNovo] = useState('');
  const [enviandoNova, setEnviandoNova] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState('');

  useEffect(() => {
    apiClient
      .request<ObservacaoInterna[]>(`/demandas/${demandaId}/observacoes`, { auth: true })
      .then(setObservacoes)
      .catch(() => setErro('Não foi possível carregar as observações.'))
      .finally(() => setCarregando(false));
  }, [demandaId]);

  async function enviarNova() {
    if (!textoNovo.trim()) return;
    setErro(null);
    setEnviandoNova(true);
    try {
      const nova = await apiClient.request<ObservacaoInterna>(`/demandas/${demandaId}/observacoes`, {
        method: 'POST',
        auth: true,
        body: { texto: textoNovo.trim() },
      });
      setObservacoes((prev) => [nova, ...prev]);
      setTextoNovo('');
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar a observação.');
    } finally {
      setEnviandoNova(false);
    }
  }

  function iniciarEdicao(nota: ObservacaoInterna) {
    setErro(null);
    setEditandoId(nota.id);
    setTextoEdicao(nota.texto);
  }

  async function salvarEdicao(notaId: string) {
    if (!textoEdicao.trim()) return;
    setErro(null);
    try {
      const atualizada = await apiClient.request<ObservacaoInterna>(`/demandas/${demandaId}/observacoes/${notaId}`, {
        method: 'PATCH',
        auth: true,
        body: { texto: textoEdicao.trim() },
      });
      setObservacoes((prev) => prev.map((nota) => (nota.id === notaId ? atualizada : nota)));
      setEditandoId(null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar a edição.');
    }
  }

  async function apagar(notaId: string) {
    if (!window.confirm('Apagar esta observação?')) return;
    setErro(null);
    try {
      await apiClient.request(`/demandas/${demandaId}/observacoes/${notaId}`, { method: 'DELETE', auth: true });
      setObservacoes((prev) => prev.filter((nota) => nota.id !== notaId));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível apagar a observação.');
    }
  }

  if (carregando) return <p className="text-sm text-gray-500">Carregando observações…</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-gray-600">Observações internas</p>

      {observacoes.length === 0 && <p className="text-sm text-gray-500">Nenhuma observação ainda.</p>}

      <ul className="flex flex-col gap-2">
        {observacoes.map((nota) => (
          <li key={nota.id} className="rounded-xl border border-gray-200 p-3 text-sm">
            {editandoId === nota.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  rows={3}
                  value={textoEdicao}
                  onChange={(e) => setTextoEdicao(e.target.value)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => salvarEdicao(nota.id)}
                    disabled={!textoEdicao.trim()}
                    className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoId(null)}
                    className="rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary-dark"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-gray-900">{nota.texto}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {nota.autorNome} — {new Date(nota.createdAt).toLocaleString('pt-BR')}
                  {nota.updatedAt && ' (editado)'}
                </p>
                {nota.autorId === user?.id && (
                  <div className="mt-2 flex gap-3">
                    <button type="button" onClick={() => iniciarEdicao(nota)} className="text-xs font-medium text-primary">
                      Editar
                    </button>
                    <button type="button" onClick={() => apagar(nota.id)} className="text-xs font-medium text-red-600">
                      Apagar
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <textarea
          rows={3}
          placeholder="Escrever uma observação…"
          value={textoNovo}
          onChange={(e) => setTextoNovo(e.target.value)}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={enviarNova}
          disabled={!textoNovo.trim() || enviandoNova}
          className="w-fit rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Adicionar observação
        </button>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
