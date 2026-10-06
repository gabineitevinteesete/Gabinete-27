'use client';

import { useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { maskPhone } from '@/lib/phone-mask';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import type { DemandaResumo } from '@/types/request';

interface ListaDemandasResposta {
  items: DemandaResumo[];
  total: number;
}

export function BuscaCidadao() {
  const [telefone, setTelefone] = useState('');
  const [resultados, setResultados] = useState<DemandaResumo[] | null>(null);
  const [total, setTotal] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [anonimizandoId, setAnonimizandoId] = useState<string | null>(null);

  const telefoneValido = telefone.replace(/\D/g, '').length >= 10;

  async function buscar(event: React.FormEvent) {
    event.preventDefault();
    if (!telefoneValido) return;
    setErro(null);
    setBuscando(true);
    try {
      const params = new URLSearchParams({ solicitanteTelefone: telefone });
      const resposta = await apiClient.request<ListaDemandasResposta>(`/demandas?${params.toString()}`, {
        auth: true,
      });
      setResultados(resposta.items);
      setTotal(resposta.total);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível buscar. Tente novamente.');
      setResultados(null);
      setTotal(0);
    } finally {
      setBuscando(false);
    }
  }

  async function anonimizar(demanda: DemandaResumo) {
    if (anonimizandoId) return;
    if (!window.confirm(`Anonimizar os dados de "${demanda.solicitanteNome}" nesta demanda? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setErro(null);
    setAnonimizandoId(demanda.id);
    try {
      await apiClient.request(`/demandas/${demanda.id}/anonimizar`, { method: 'PATCH', auth: true });
      setResultados((prev) => prev?.filter((d) => d.id !== demanda.id) ?? null);
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível anonimizar. Tente novamente.');
    } finally {
      setAnonimizandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={buscar} className="flex items-end gap-3">
        <div className="max-w-xs flex-1">
          <TextField
            label="Telefone do cidadão"
            name="telefone"
            inputMode="numeric"
            value={maskPhone(telefone)}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={!telefoneValido || buscando || anonimizandoId !== null} className="w-fit">
          {buscando ? 'Buscando…' : 'Buscar'}
        </Button>
      </form>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {resultados !== null && resultados.length === 0 && total === 0 && (
        <p className="text-sm text-gray-500">Nenhuma demanda encontrada para este telefone.</p>
      )}

      {resultados !== null && resultados.length === 0 && total > 0 && (
        <p className="text-sm text-gray-500">
          Restam {total} demandas deste telefone. Busque de novo para vê-las.
        </p>
      )}

      {resultados !== null && resultados.length > 0 && total > resultados.length && (
        <p className="text-sm text-gray-600">
          Mostrando {resultados.length} de {total} demandas. Anonimize estas e busque de novo para ver as demais.
        </p>
      )}

      {resultados !== null && resultados.length > 0 && (
        <div className="overflow-x-auto rounded-card bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-600">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Solicitante</th>
                <th className="px-3 py-2">Criada em</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((demanda) => (
                <tr key={demanda.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-700">{demanda.codigoInterno}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{demanda.tituloResumido}</td>
                  <td className="px-3 py-2 text-gray-700">{demanda.solicitanteNome}</td>
                  <td className="px-3 py-2 text-gray-700">{new Date(demanda.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => anonimizar(demanda)}
                      disabled={anonimizandoId !== null}
                      aria-label={`Anonimizar dados de ${demanda.solicitanteNome}`}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      {anonimizandoId === demanda.id ? 'Anonimizando…' : 'Anonimizar dados'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
