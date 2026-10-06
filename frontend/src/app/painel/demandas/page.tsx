'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/services/api-client';
import type { DemandaResumo, TipoDemanda } from '@/types/request';
import { STATUS_LABEL } from '@/lib/request-status';
import { ExportarDemandas } from '@/components/ExportarDemandas';

const DEBOUNCE_MS = 350;

interface ListaDemandasResposta {
  items: DemandaResumo[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

// Debounce dos campos de texto: sem isto cada tecla digitada virava uma requisição à API.
// `aoMudar` roda junto com a atualização do valor aplicado, para a página só voltar a 1
// quando o texto de fato entra na busca (e não a cada tecla, o que geraria uma busca extra).
function useDebounced(valor: string, ms: number, aoMudar: () => void): string {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    if (valor === debounced) return;
    const timer = setTimeout(() => {
      setDebounced(valor);
      aoMudar();
    }, ms);
    return () => clearTimeout(timer);
  }, [valor, debounced, ms, aoMudar]);
  return debounced;
}

// Data digitada incompleta ou absurda (ex.: ano com 5 dígitos) vira null em vez de quebrar a página.
function inicioOuFimDoDia(data: string, fim: boolean): string | null {
  const d = new Date(`${data}T${fim ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface Filtros {
  bairro: string;
  codigo: string;
  nome: string;
  tipoId: string;
  status: string;
  de: string;
  ate: string;
  assessorResponsavelId: string;
}

// Query string dos filtros (sem paginação): usada tanto na listagem quanto na exportação,
// para a planilha corresponder exatamente ao que está na tela.
function montarFiltros(f: Filtros): string {
  const params = new URLSearchParams();
  if (f.bairro) params.set('bairro', f.bairro);
  if (f.codigo) params.set('codigoInterno', f.codigo);
  if (f.nome) params.set('solicitanteNome', f.nome);
  if (f.tipoId) params.set('requestTypeId', f.tipoId);
  if (f.status) params.set('status', f.status);
  const dataInicial = f.de ? inicioOuFimDoDia(f.de, false) : null;
  const dataFinal = f.ate ? inicioOuFimDoDia(f.ate, true) : null;
  if (dataInicial) params.set('dataInicial', dataInicial);
  if (dataFinal) params.set('dataFinal', dataFinal);
  if (f.assessorResponsavelId) params.set('assessorResponsavelId', f.assessorResponsavelId);
  return params.toString();
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

  const voltarParaPrimeiraPagina = useCallback(() => setPagina(1), []);
  const bairroBuscado = useDebounced(bairro.trim(), DEBOUNCE_MS, voltarParaPrimeiraPagina);
  const codigoBuscado = useDebounced(codigo.trim(), DEBOUNCE_MS, voltarParaPrimeiraPagina);
  const nomeBuscado = useDebounced(nome.trim(), DEBOUNCE_MS, voltarParaPrimeiraPagina);

  const filtros = montarFiltros({
    bairro: bairroBuscado,
    codigo: codigoBuscado,
    nome: nomeBuscado,
    tipoId,
    status,
    de,
    ate,
    assessorResponsavelId,
  });

  useEffect(() => {
    apiClient
      .request<TipoDemanda[]>('/tipos-demanda', { auth: true })
      .then(setTipos)
      .catch(() => setTipos([]));
  }, []);

  useEffect(() => {
    // Ignora respostas de buscas antigas que cheguem depois de uma mais nova.
    let ativo = true;
    setCarregando(true);
    const paginacao = `pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`;

    apiClient
      .request<ListaDemandasResposta>(`/demandas?${paginacao}${filtros ? `&${filtros}` : ''}`, { auth: true })
      .then((resposta) => {
        if (!ativo) return;
        setItens(resposta.items);
        setTotal(resposta.total);
      })
      .catch(() => {
        if (!ativo) return;
        setItens([]);
        setTotal(0);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [pagina, filtros]);

  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));
  const filtrosAtivos = Boolean(bairro.trim() || codigo.trim() || nome.trim() || tipoId || status || de || ate);

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

      <ExportarDemandas filtros={filtros} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        <div>
          <label htmlFor="filtro-codigo" className="text-xs font-medium text-gray-600">
            Código
          </label>
          <input
            id="filtro-codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
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
            onChange={(e) => setNome(e.target.value)}
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
            onChange={(e) => setBairro(e.target.value)}
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
