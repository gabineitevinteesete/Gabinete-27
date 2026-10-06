# Busca e filtros na lista de Demandas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à tela `/painel/demandas` filtros por código, nome do solicitante, tipo de demanda e período (além de Bairro e Status), com botão "Limpar filtros".

**Architecture:** Só frontend. A página passa a ter um hook `useDebounced` local (350ms) para os três campos de texto, um fetch de `/tipos-demanda` ao montar para a lista de tipos, e converte as datas do período para o dia local inteiro (ISO) antes de enviar. Backend inalterado (`GET /demandas` já aceita todos os parâmetros).

**Tech Stack:** Next.js/React/TypeScript/Tailwind; Vitest + Testing Library.

Design de referência: `docs/superpowers/specs/2026-10-07-filtros-lista-demandas-design.md`.

## Global Constraints

- Nenhum arquivo de `backend/` é tocado.
- Parâmetros enviados: `codigoInterno`, `solicitanteNome`, `requestTypeId`, `dataInicial`, `dataFinal` (nomes exatos do `listarDemandasQuerySchema`), além dos já existentes.
- `dataInicial` = início do dia local (`T00:00:00`), `dataFinal` = fim do dia local (`T23:59:59.999`), ambos via `new Date(...).toISOString()`.
- Qualquer mudança de filtro volta para a página 1.
- O filtro `assessorResponsavelId` (só via URL, sem campo na tela) não conta para "Limpar filtros" e não é limpo.

---

### Task 1: Filtros na lista de Demandas

**Files:**
- Modify: `frontend/src/app/painel/demandas/page.tsx` (substituir o arquivo inteiro)
- Modify: `frontend/src/app/painel/demandas/page.test.tsx` (substituir o arquivo inteiro)

- [ ] **Step 1: Substituir `frontend/src/app/painel/demandas/page.tsx` por:**

```tsx
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
```

- [ ] **Step 2: Substituir `frontend/src/app/painel/demandas/page.test.tsx` por:**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DemandasPage from './page';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

// Lê window.location.search em tempo de chamada (não um valor fixo), pois os testes
// mudam a URL via window.history.replaceState antes de renderizar a página.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

function itemFake(overrides: Record<string, unknown> = {}) {
  return {
    id: '1', codigoInterno: 'GD-1', tituloResumido: 'Buraco na rua', solicitanteNome: 'Maria',
    bairro: 'Centro', status: 'ENVIADA', assessorResponsavelId: 'a1', assessorResponsavelNome: 'Assessor',
    requestTypeId: 'tipo-1', requestTypeNome: 'Tapa-buraco', numeroProtocolo: null, createdAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

const tipoFake = { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false };
const RESPOSTA_VAZIA = { items: [], total: 0, pagina: 1, tamanhoPagina: 20 };

// A página faz uma chamada a /tipos-demanda ao montar; o mock responde por URL para que os
// testes contem só as chamadas a /demandas.
function mockApi(respostaDemandas: unknown = RESPOSTA_VAZIA) {
  vi.mocked(apiClient.request).mockImplementation((async (url: string) =>
    url.startsWith('/tipos-demanda') ? [tipoFake] : respostaDemandas) as unknown as typeof apiClient.request);
}

function chamadasDemandas() {
  return vi.mocked(apiClient.request).mock.calls.filter(([url]) => String(url).startsWith('/demandas'));
}

function urlDaChamada(indice: number) {
  return String(chamadasDemandas()[indice]![0]);
}

function ultimaUrl() {
  const chamadas = chamadasDemandas();
  return String(chamadas[chamadas.length - 1]![0]);
}

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('DemandasPage', () => {
  it('lista as demandas retornadas pela API', async () => {
    mockApi({ items: [itemFake()], total: 1, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);

    expect(await screen.findByText('Buraco na rua')).toBeInTheDocument();
    expect(screen.getByText(/Maria/)).toBeInTheDocument();
  });

  it('refaz a busca quando o filtro de bairro muda', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText(/bairro/i), { target: { value: 'Centro' } });

    // O filtro é debounced (350ms), então a busca não sai no mesmo tick da digitação.
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(2));
    expect(urlDaChamada(1)).toContain('bairro=Centro');
  });

  it('não dispara uma requisição por tecla digitada no filtro de bairro', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));

    const campo = screen.getByLabelText(/bairro/i);
    fireEvent.change(campo, { target: { value: 'C' } });
    fireEvent.change(campo, { target: { value: 'Ce' } });
    fireEvent.change(campo, { target: { value: 'Cen' } });
    fireEvent.change(campo, { target: { value: 'Centro' } });

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(2));
    expect(urlDaChamada(1)).toContain('bairro=Centro');
  });

  it('mostra mensagem quando não há demandas', async () => {
    mockApi();

    render(<DemandasPage />);

    expect(await screen.findByText(/nenhuma demanda encontrada/i)).toBeInTheDocument();
  });

  it('refaz a busca quando o filtro de status muda', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'RECEBIDA' } });

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(2));
    expect(urlDaChamada(1)).toContain('status=RECEBIDA');
  });

  it('lê assessorResponsavelId da URL de entrada e aplica no filtro', async () => {
    const paramsOriginais = window.location.search;
    window.history.replaceState({}, '', '/painel/demandas?assessorResponsavelId=assessor-123');
    mockApi();

    render(<DemandasPage />);

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));
    expect(urlDaChamada(0)).toContain('assessorResponsavelId=assessor-123');

    window.history.replaceState({}, '', `/painel/demandas${paramsOriginais}`);
  });

  it('lê status da URL de entrada e aplica no primeiro fetch', async () => {
    const paramsOriginais = window.location.search;
    window.history.replaceState({}, '', '/painel/demandas?status=RECEBIDA');
    mockApi();

    render(<DemandasPage />);

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));
    expect(urlDaChamada(0)).toContain('status=RECEBIDA');

    window.history.replaceState({}, '', `/painel/demandas${paramsOriginais}`);
  });

  it('lê bairro da URL de entrada e aplica no primeiro fetch', async () => {
    const paramsOriginais = window.location.search;
    window.history.replaceState({}, '', '/painel/demandas?bairro=Centro');
    mockApi();

    render(<DemandasPage />);

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));
    expect(urlDaChamada(0)).toContain('bairro=Centro');

    window.history.replaceState({}, '', `/painel/demandas${paramsOriginais}`);
  });
});

describe('DemandasPage — filtros novos', () => {
  it('filtra por código', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GD-2026' } });

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(2));
    expect(urlDaChamada(1)).toContain('codigoInterno=GD-2026');
  });

  it('filtra pelo nome do solicitante', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Nome do solicitante'), { target: { value: 'Maria' } });

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(2));
    expect(urlDaChamada(1)).toContain('solicitanteNome=Maria');
  });

  it('filtra por tipo de demanda, com as opções vindas de /tipos-demanda', async () => {
    mockApi();

    render(<DemandasPage />);
    expect(await screen.findByRole('option', { name: 'Tapa-buraco' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tipo de demanda'), { target: { value: 'tipo-1' } });

    await waitFor(() => expect(ultimaUrl()).toContain('requestTypeId=tipo-1'));
  });

  it('filtra por período e o "Até" cobre o dia local inteiro', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-31' } });

    await waitFor(() => {
      const url = ultimaUrl();
      expect(url).toContain('dataInicial=');
      expect(url).toContain('dataFinal=');
    });

    const params = new URLSearchParams(ultimaUrl().split('?')[1]);
    const inicio = new Date(params.get('dataInicial')!);
    const fim = new Date(params.get('dataFinal')!);
    expect([inicio.getDate(), inicio.getHours(), inicio.getMinutes()]).toEqual([1, 0, 0]);
    expect([fim.getDate(), fim.getHours(), fim.getMinutes()]).toEqual([31, 23, 59]);
  });

  it('volta para a página 1 ao mudar um filtro', async () => {
    mockApi({ items: [itemFake()], total: 45, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);
    fireEvent.click(await screen.findByText('Próxima'));
    await waitFor(() => expect(ultimaUrl()).toContain('pagina=2'));

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'RECEBIDA' } });

    await waitFor(() => {
      expect(ultimaUrl()).toContain('pagina=1');
      expect(ultimaUrl()).toContain('status=RECEBIDA');
    });
  });

  it('mostra "Limpar filtros" só com filtro ativo e limpa tudo ao clicar', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'RECEBIDA' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Limpar filtros' }));

    expect(screen.getByLabelText(/status/i)).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
    await waitFor(() => expect(ultimaUrl()).not.toContain('status='));
  });
});
```

- [ ] **Step 3: Rodar os testes da página**

Run: `cd frontend && npx vitest run src/app/painel/demandas/page.test.tsx`
Expected: todos passando (8 existentes adaptados + 6 novos = 14).

- [ ] **Step 4: Suíte completa e typecheck**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: tudo passando e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/painel/demandas/page.tsx frontend/src/app/painel/demandas/page.test.tsx
git commit -m "feat(frontend): filtros por codigo, nome, tipo e periodo na lista de demandas"
```
