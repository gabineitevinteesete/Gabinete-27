'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/services/api-client';
import type { DemandaResumo, TipoDemanda } from '@/types/request';
import { STATUS_LABEL } from '@/lib/request-status';

const DEBOUNCE_MS = 350;

interface ListaDemandasResposta {
  items: DemandaResumo[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

// Debounce dos campos de texto: sem isto cada tecla digitada virava uma requisição à API.
function useDebounced<T>(valor: T, ms: number): T {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(valor), ms);
    return () => clearTimeout(timer);
  }, [valor, ms]);
  return debounced;
}

const CLASSE_CAMPO =
  'mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary';

export default function DemandasPage() {
  const searchParams = useSearchParams();
  const assessorResponsavelIdInicial = searchParams.get('assessorResponsavelId') ?? '';
  const bairroInicial = searchParams.get('bairro') ?? '';
  const statusInicial = searchParams.get('status') ?? '';

  const [itens, setItens] = useState<DemandaResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [bairro, setBairro] = useState(bairroInicial);
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [status, setStatus] = useState(statusInicial);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [assessorResponsavelId] = useState(assessorResponsavelIdInicial);
  const [tipos, setTipos] = useState<TipoDemanda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const tamanhoPagina = 20;

  const bairroBuscado = useDebounced(bairro, DEBOUNCE_MS);
  const codigoBuscado = useDebounced(codigo, DEBOUNCE_MS);
  const nomeBuscado = useDebounced(nome, DEBOUNCE_MS);

  useEffect(() => {
    apiClient
      .request<TipoDemanda[]>('/tipos-demanda', { auth: true })
      .then(setTipos)
      .catch(() => setTipos([]));
  }, []);

  useEffect(() => {
    setCarregando(true);
    const params = new URLSearchParams({ pagina: String(pagina), tamanhoPagina: String(tamanhoPagina) });
    if (bairroBuscado) params.set('bairro', bairroBuscado);
    if (codigoBuscado.trim()) params.set('codigoInterno', codigoBuscado.trim());
    if (nomeBuscado.trim()) params.set('solicitanteNome', nomeBuscado.trim());
    if (tipoId) params.set('requestTypeId', tipoId);
    if (status) params.set('status', status);
    if (de) params.set('dataInicial', new Date(`${de}T00:00:00`).toISOString());
    if (ate) params.set('dataFinal', new Date(`${ate}T23:59:59.999`).toISOString());
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
  }, [pagina, bairroBuscado, codigoBuscado, nomeBuscado, tipoId, status, de, ate, assessorResponsavelId]);

  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));
  const filtrosAtivos = Boolean(bairro || codigo || nome || tipoId || status || de || ate);

  function alterar(setter: (valor: string) => void) {
    return (valor: string) => {
      setPagina(1);
      setter(valor);
    };
  }

  function limparFiltros() {
    setPagina(1);
    setBairro('');
    setCodigo('');
    setNome('');
    setTipoId('');
    setStatus('');
    setDe('');
    setAte('');
  }

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        <div>
          <label htmlFor="filtro-codigo" className="text-xs font-medium text-gray-600">
            Código
          </label>
          <input
            id="filtro-codigo"
            value={codigo}
            onChange={(e) => alterar(setCodigo)(e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>

        <div>
          <label htmlFor="filtro-nome" className="text-xs font-medium text-gray-600">
            Nome do solicitante
          </label>
          <input
            id="filtro-nome"
            value={nome}
            onChange={(e) => alterar(setNome)(e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>

        <div>
          <label htmlFor="filtro-bairro" className="text-xs font-medium text-gray-600">
            Bairro
          </label>
          <input
            id="filtro-bairro"
            value={bairro}
            onChange={(e) => alterar(setBairro)(e.target.value)}
            className={CLASSE_CAMPO}
          />
        </div>

        <div>
          <label htmlFor="filtro-tipo" className="text-xs font-medium text-gray-600">
            Tipo de demanda
          </label>
          <select
            id="filtro-tipo"
            value={tipoId}
            onChange={(e) => alterar(setTipoId)(e.target.value)}
            className={CLASSE_CAMPO}
          >
            <option value="">Todos</option>
            {tipos.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filtro-status" className="text-xs font-medium text-gray-600">
            Status
          </label>
          <select
            id="filtro-status"
            value={status}
            onChange={(e) => alterar(setStatus)(e.target.value)}
            className={CLASSE_CAMPO}
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="filtro-de" className="text-xs font-medium text-gray-600">
              De
            </label>
            <input
              id="filtro-de"
              type="date"
              value={de}
              onChange={(e) => alterar(setDe)(e.target.value)}
              className={CLASSE_CAMPO}
            />
          </div>
          <div>
            <label htmlFor="filtro-ate" className="text-xs font-medium text-gray-600">
              Até
            </label>
            <input
              id="filtro-ate"
              type="date"
              value={ate}
              onChange={(e) => alterar(setAte)(e.target.value)}
              className={CLASSE_CAMPO}
            />
          </div>
        </div>
      </div>

      {filtrosAtivos && (
        <button
          type="button"
          onClick={limparFiltros}
          className="w-fit text-sm font-medium text-primary-dark hover:underline"
        >
          Limpar filtros
        </button>
      )}

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
