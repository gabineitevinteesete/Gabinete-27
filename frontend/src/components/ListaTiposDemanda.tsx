'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { ModalTipoDemanda } from '@/components/ModalTipoDemanda';
import { Button } from '@/components/Button';
import type { TipoDemandaAdmin } from '@/types/request';

export function ListaTiposDemanda() {
  const [tipos, setTipos] = useState<TipoDemandaAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [modalAberto, setModalAberto] = useState<'criar' | TipoDemandaAdmin | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  function buscar() {
    setCarregando(true);
    setErro(false);
    apiClient
      .request<TipoDemandaAdmin[]>('/tipos-demanda/todos', { auth: true })
      .then(setTipos)
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }

  useEffect(buscar, []);

  async function alternarAtivo(tipo: TipoDemandaAdmin) {
    setErroAcao(null);
    try {
      const atualizado = await apiClient.request<TipoDemandaAdmin>(`/tipos-demanda/${tipo.id}/ativo`, {
        method: 'PATCH',
        auth: true,
        body: { ativo: !tipo.ativo },
      });
      setTipos((prev) => prev.map((t) => (t.id === atualizado.id ? atualizado : t)));
    } catch (err) {
      setErroAcao(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    }
  }

  function handleSalvo() {
    setModalAberto(null);
    buscar();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-end">
        <Button type="button" onClick={() => setModalAberto('criar')} className="w-fit">
          + Novo tipo
        </Button>
      </div>

      {erroAcao && <p className="text-sm text-red-600">{erroAcao}</p>}
      {carregando && <p className="text-sm text-gray-500">Carregando…</p>}
      {erro && <p className="text-sm text-red-600">Não foi possível carregar os tipos de demanda.</p>}

      {!carregando && !erro && (
        <div className="overflow-x-auto rounded-card bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-600">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Exige descrição</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((tipo) => (
                <tr key={tipo.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900">{tipo.nome}</td>
                  <td className="px-3 py-2 text-gray-700">{tipo.exigeDescricaoObrigatoria ? 'Sim' : 'Não'}</td>
                  <td className="px-3 py-2">{tipo.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => alternarAtivo(tipo)}
                        aria-label={`${tipo.ativo ? 'Desativar' : 'Ativar'} ${tipo.nome}`}
                        className="text-xs font-medium text-primary-dark hover:underline"
                      >
                        {tipo.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalAberto(tipo)}
                        aria-label={`Editar ${tipo.nome}`}
                        className="text-xs font-medium text-primary-dark hover:underline"
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tipos.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum tipo de demanda cadastrado.</p>}
        </div>
      )}

      {modalAberto && (
        <ModalTipoDemanda
          modo={modalAberto === 'criar' ? 'criar' : 'editar'}
          tipo={modalAberto === 'criar' ? undefined : modalAberto}
          onFechar={() => setModalAberto(null)}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  );
}
