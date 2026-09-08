'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/services/api-client';
import type { DemandaResumo } from '@/types/request';
import { STATUS_LABEL } from '@/lib/request-status';

const DEBOUNCE_BAIRRO_MS = 350;

interface ListaDemandasResposta {
  items: DemandaResumo[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

export default function DemandasPage() {
  const searchParams = useSearchParams();
  const assessorResponsavelIdInicial = searchParams.get('assessorResponsavelId') ?? '';

  const [itens, setItens] = useState<DemandaResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [bairro, setBairro] = useState('');
  const [bairroBuscado, setBairroBuscado] = useState('');
  const [status, setStatus] = useState('');
  const [assessorResponsavelId] = useState(assessorResponsavelIdInicial);
  const [carregando, setCarregando] = useState(true);
  const tamanhoPagina = 20;

  // Debounce do filtro: sem isto cada tecla digitada virava uma requisição à API.
  useEffect(() => {
    const timer = setTimeout(() => setBairroBuscado(bairro), DEBOUNCE_BAIRRO_MS);
    return () => clearTimeout(timer);
  }, [bairro]);

  useEffect(() => {
    setCarregando(true);
    const params = new URLSearchParams({ pagina: String(pagina), tamanhoPagina: String(tamanhoPagina) });
    if (bairroBuscado) params.set('bairro', bairroBuscado);
    if (status) params.set('status', status);
    if (assessorResponsavelId) params.set('assessorResponsavelId', assessorResponsavelId);

    apiClient
      .request<ListaDemandasResposta>(`/demandas?${params.toString()}`, { auth: true })
      .then((resposta) => {
        setItens(resposta.items);
        setTotal(resposta.total);
      })
      .catch(() => {
        setItens([]);
        setTotal(0);
      })
      .finally(() => setCarregando(false));
  }, [pagina, bairroBuscado, status, assessorResponsavelId]);

  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-primary-dark">Demandas</h1>
        <Link
          href="/painel/demandas/nova"
          className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white"
        >
          Nova demanda
        </Link>
      </div>

      <div className="max-w-xs">
        <label htmlFor="filtro-bairro" className="text-xs font-medium text-gray-600">
          Bairro
        </label>
        <input
          id="filtro-bairro"
          value={bairro}
          onChange={(e) => {
            setPagina(1);
            setBairro(e.target.value);
          }}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="max-w-xs">
        <label htmlFor="filtro-status" className="text-xs font-medium text-gray-600">
          Status
        </label>
        <select
          id="filtro-status"
          value={status}
          onChange={(e) => {
            setPagina(1);
            setStatus(e.target.value);
          }}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Todos</option>
          {Object.entries(STATUS_LABEL).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </div>

      {carregando && <p className="text-sm text-gray-500">Carregando…</p>}

      {!carregando && itens.length === 0 && (
        <p className="text-sm text-gray-500">Nenhuma demanda encontrada.</p>
      )}

      <div className="flex flex-col gap-2">
        {itens.map((demanda) => (
          <Link
            key={demanda.id}
            href={`/painel/demandas/${demanda.id}`}
            className="rounded-card bg-white p-4 shadow-sm"
          >
            <p className="font-medium text-gray-900">{demanda.tituloResumido}</p>
            <p className="text-sm text-gray-600">{demanda.solicitanteNome} — {demanda.bairro ?? 'sem bairro'}</p>
            <span className="mt-1 inline-block rounded-full bg-primary-light px-3 py-1 text-xs font-medium text-primary-dark">
              {STATUS_LABEL[demanda.status] ?? demanda.status}
            </span>
          </Link>
        ))}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
            className="text-sm text-primary disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="text-sm text-primary disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
