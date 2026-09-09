'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { ROLE_LABEL, ROLE_OPTIONS } from '@/lib/user-role';
import { ModalAssessor } from '@/components/ModalAssessor';
import { Button } from '@/components/Button';
import type { PublicUser, UserRoleValue } from '@/types/auth';

type FiltroPapel = UserRoleValue | '';
type FiltroAtivo = 'true' | 'false' | '';

export function ListaAssessores() {
  const [assessores, setAssessores] = useState<PublicUser[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [filtroPapel, setFiltroPapel] = useState<FiltroPapel>('');
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroAtivo>('');
  const [modalAberto, setModalAberto] = useState<'criar' | PublicUser | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  function buscar() {
    setCarregando(true);
    setErro(false);
    const params = new URLSearchParams();
    if (filtroPapel) params.set('role', filtroPapel);
    if (filtroAtivo) params.set('ativo', filtroAtivo);
    const query = params.toString();
    apiClient
      .request<PublicUser[]>(`/usuarios${query ? `?${query}` : ''}`, { auth: true })
      .then(setAssessores)
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }

  useEffect(buscar, [filtroPapel, filtroAtivo]);

  async function mudarPapel(assessor: PublicUser, novoRole: UserRoleValue) {
    setErroAcao(null);
    try {
      const atualizado = await apiClient.request<PublicUser>(`/usuarios/${assessor.id}/role`, {
        method: 'PATCH',
        auth: true,
        body: { role: novoRole },
      });
      setAssessores((prev) => prev.map((a) => (a.id === atualizado.id ? atualizado : a)));
    } catch (err) {
      setErroAcao(err instanceof ApiError ? err.message : 'Não foi possível mudar o papel.');
    }
  }

  async function alternarAtivo(assessor: PublicUser) {
    setErroAcao(null);
    try {
      const atualizado = await apiClient.request<PublicUser>(`/usuarios/${assessor.id}/ativo`, {
        method: 'PATCH',
        auth: true,
        body: { ativo: !assessor.ativo },
      });
      setAssessores((prev) => prev.map((a) => (a.id === atualizado.id ? atualizado : a)));
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
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-papel" className="text-xs font-medium text-gray-600">
            Papel
          </label>
          <select
            id="filtro-papel"
            value={filtroPapel}
            onChange={(e) => setFiltroPapel(e.target.value as FiltroPapel)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {ROLE_OPTIONS.map((opcao) => (
              <option key={opcao} value={opcao}>
                {ROLE_LABEL[opcao]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-ativo" className="text-xs font-medium text-gray-600">
            Status
          </label>
          <select
            id="filtro-ativo"
            value={filtroAtivo}
            onChange={(e) => setFiltroAtivo(e.target.value as FiltroAtivo)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>
        <Button type="button" onClick={() => setModalAberto('criar')} className="w-fit">
          + Novo assessor
        </Button>
      </div>

      {erroAcao && <p className="text-sm text-red-600">{erroAcao}</p>}
      {carregando && <p className="text-sm text-gray-500">Carregando…</p>}
      {erro && <p className="text-sm text-red-600">Não foi possível carregar os assessores.</p>}

      {!carregando && !erro && (
        <div className="overflow-x-auto rounded-card bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-600">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Telefone</th>
                <th className="px-3 py-2">Papel</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {assessores.map((assessor) => (
                <tr key={assessor.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900">{assessor.nome}</td>
                  <td className="px-3 py-2 text-gray-700">{assessor.telefone}</td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Papel de ${assessor.nome}`}
                      value={assessor.role}
                      onChange={(e) => mudarPapel(assessor, e.target.value as UserRoleValue)}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    >
                      {ROLE_OPTIONS.map((opcao) => (
                        <option key={opcao} value={opcao}>
                          {ROLE_LABEL[opcao]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">{assessor.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => alternarAtivo(assessor)}
                        aria-label={`${assessor.ativo ? 'Desativar' : 'Ativar'} ${assessor.nome}`}
                        className="text-xs font-medium text-primary-dark hover:underline"
                      >
                        {assessor.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalAberto(assessor)}
                        aria-label={`Editar ${assessor.nome}`}
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
          {assessores.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum assessor encontrado.</p>}
        </div>
      )}

      {modalAberto && (
        <ModalAssessor
          modo={modalAberto === 'criar' ? 'criar' : 'editar'}
          assessor={modalAberto === 'criar' ? undefined : modalAberto}
          onFechar={() => setModalAberto(null)}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  );
}
