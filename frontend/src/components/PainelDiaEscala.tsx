'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import type { PublicUser } from '@/types/auth';
import type { AtribuicaoEscala, LocalEscalaValue } from '@/types/escala';

interface PainelDiaEscalaProps {
  data: string;
  atribuicoes: AtribuicaoEscala[];
  podeEditar: boolean;
  onFechar: () => void;
  onSalvo: (data: string, novasAtribuicoes: AtribuicaoEscala[]) => void;
}

type SelecaoLocal = LocalEscalaValue | '';

export function PainelDiaEscala({ data, atribuicoes, podeEditar, onFechar, onSalvo }: PainelDiaEscalaProps) {
  const [assessores, setAssessores] = useState<PublicUser[]>([]);
  const [selecoes, setSelecoes] = useState<Record<string, SelecaoLocal>>({});
  const [carregando, setCarregando] = useState(podeEditar);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!podeEditar) return;
    apiClient
      .request<PublicUser[]>('/usuarios?ativo=true', { auth: true })
      .then((lista) => {
        const naoChefes = lista.filter((u) => u.role !== 'CHEFE');
        setAssessores(naoChefes);
        const iniciais: Record<string, SelecaoLocal> = {};
        for (const assessor of naoChefes) {
          const atual = atribuicoes.find((a) => a.userId === assessor.id);
          iniciais[assessor.id] = atual?.local ?? '';
        }
        setSelecoes(iniciais);
      })
      .catch(() => setErro('Não foi possível carregar os assessores.'))
      .finally(() => setCarregando(false));
    // `atribuicoes` fica de fora de propósito: só deve reiniciar a seleção quando o
    // painel troca de dia, não a cada nova referência de array vinda do pai.
  }, [podeEditar, data]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const novasAtribuicoes = Object.entries(selecoes)
        .filter((entrada): entrada is [string, LocalEscalaValue] => entrada[1] !== '')
        .map(([userId, local]) => ({ userId, local }));

      await apiClient.request(`/escala/${data}`, {
        method: 'PUT',
        auth: true,
        body: { atribuicoes: novasAtribuicoes },
      });

      const comNome: AtribuicaoEscala[] = novasAtribuicoes.map(({ userId, local }) => ({
        userId,
        local,
        userNome: assessores.find((a) => a.id === userId)?.nome ?? '',
      }));
      onSalvo(data, comNome);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-dark">Escala de {data}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        {!podeEditar && (
          <ul className="flex flex-col gap-1">
            {atribuicoes.length === 0 && <li className="text-sm text-gray-500">Ninguém escalado neste dia.</li>}
            {atribuicoes.map((a) => (
              <li key={a.userId} className="text-sm text-gray-800">
                {a.userNome} — {a.local === 'GABINETE' ? 'Gabinete' : 'Rua'}
              </li>
            ))}
          </ul>
        )}

        {podeEditar && carregando && <p className="text-sm text-gray-500">Carregando…</p>}

        {podeEditar && !carregando && (
          <div className="flex flex-col gap-2">
            {assessores.map((assessor) => (
              <div key={assessor.id} className="flex items-center justify-between gap-2">
                <label htmlFor={`local-${assessor.id}`} className="text-sm text-gray-800">
                  {assessor.nome}
                </label>
                <select
                  id={`local-${assessor.id}`}
                  value={selecoes[assessor.id] ?? ''}
                  onChange={(e) =>
                    setSelecoes((prev) => ({ ...prev, [assessor.id]: e.target.value as SelecaoLocal }))
                  }
                  className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">Não escalado</option>
                  <option value="GABINETE">Gabinete</option>
                  <option value="RUA">Rua</option>
                </select>
              </div>
            ))}
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="mt-2 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        )}

        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
      </div>
    </div>
  );
}
