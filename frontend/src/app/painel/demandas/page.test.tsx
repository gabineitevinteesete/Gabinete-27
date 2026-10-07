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

// O botão de exportar tem testes próprios; aqui só interessa a query string que a página lhe entrega.
vi.mock('@/components/ExportarDemandas', () => ({
  ExportarDemandas: ({ filtros, desabilitado }: { filtros: string; desabilitado?: boolean }) => (
    <span data-testid="exportar" data-filtros={filtros} data-desabilitado={String(Boolean(desabilitado))} />
  ),
}));

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

describe('DemandasPage — robustez dos filtros', () => {
  it('não dispara uma requisição por tecla no filtro de código', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));

    const campo = screen.getByLabelText('Código');
    fireEvent.change(campo, { target: { value: 'G' } });
    fireEvent.change(campo, { target: { value: 'GD' } });
    fireEvent.change(campo, { target: { value: 'GD-1' } });

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(2));
    expect(urlDaChamada(1)).toContain('codigoInterno=GD-1');
  });

  it('digitar em campo de texto estando na página 2 faz uma única busca, já na página 1', async () => {
    mockApi({ items: [itemFake()], total: 45, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);
    fireEvent.click(await screen.findByText('Próxima'));
    await waitFor(() => expect(ultimaUrl()).toContain('pagina=2'));
    const antes = chamadasDemandas().length;

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GD-9' } });

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(antes + 1));
    expect(ultimaUrl()).toContain('pagina=1');
    expect(ultimaUrl()).toContain('codigoInterno=GD-9');
  });

  it('ignora espaços nas pontas do texto digitado', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Nome do solicitante'), { target: { value: ' Maria ' } });

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(2));
    expect(new URLSearchParams(urlDaChamada(1).split('?')[1]).get('solicitanteNome')).toBe('Maria');
  });

  it('ignora data incompleta ou inválida sem quebrar a página', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '20266-10-01' } });

    // Data inválida não entra nos filtros: não há busca nova e a página continua de pé.
    await new Promise((r) => setTimeout(r, 50));
    expect(chamadasDemandas()).toHaveLength(1);
    expect(screen.getByText('Nova demanda')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });

    await waitFor(() => expect(chamadasDemandas()).toHaveLength(2));
    expect(ultimaUrl()).toContain('dataInicial=');
  });

  it('"Limpar filtros" limpa todos os campos, volta à página 1 e mantém o assessor da URL', async () => {
    const paramsOriginais = window.location.search;
    window.history.replaceState({}, '', '/painel/demandas?assessorResponsavelId=assessor-123');
    mockApi({ items: [itemFake()], total: 45, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);
    fireEvent.click(await screen.findByText('Próxima'));
    await waitFor(() => expect(ultimaUrl()).toContain('pagina=2'));

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GD-1' } });
    fireEvent.change(screen.getByLabelText('Nome do solicitante'), { target: { value: 'Maria' } });
    fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Centro' } });
    fireEvent.change(screen.getByLabelText('Tipo de demanda'), { target: { value: 'tipo-1' } });
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(ultimaUrl()).toContain('codigoInterno=GD-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(screen.getByLabelText('Código')).toHaveValue('');
    expect(screen.getByLabelText('Nome do solicitante')).toHaveValue('');
    expect(screen.getByLabelText('Bairro')).toHaveValue('');
    expect(screen.getByLabelText('Tipo de demanda')).toHaveValue('');
    expect(screen.getByLabelText('De')).toHaveValue('');
    await waitFor(() => {
      const params = new URLSearchParams(ultimaUrl().split('?')[1]);
      expect(params.get('pagina')).toBe('1');
      expect(params.get('assessorResponsavelId')).toBe('assessor-123');
      ['codigoInterno', 'solicitanteNome', 'bairro', 'requestTypeId', 'dataInicial'].forEach((chave) =>
        expect(params.has(chave)).toBe(false),
      );
    });

    window.history.replaceState({}, '', `/painel/demandas${paramsOriginais}`);
  });

  it('ignora a resposta de uma busca antiga que chega depois da mais nova', async () => {
    let resolverAntiga: (valor: unknown) => void = () => {};
    vi.mocked(apiClient.request).mockImplementation(((url: string) => {
      if (url.startsWith('/tipos-demanda')) return Promise.resolve([tipoFake]);
      if (url.includes('status=RECEBIDA')) {
        return Promise.resolve({ items: [itemFake({ tituloResumido: 'Resposta nova' })], total: 1, pagina: 1, tamanhoPagina: 20 });
      }
      return new Promise((resolve) => (resolverAntiga = resolve));
    }) as unknown as typeof apiClient.request);

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'RECEBIDA' } });
    expect(await screen.findByText('Resposta nova')).toBeInTheDocument();

    resolverAntiga({ items: [itemFake({ tituloResumido: 'Resposta antiga' })], total: 1, pagina: 1, tamanhoPagina: 20 });
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText('Resposta antiga')).not.toBeInTheDocument();
    expect(screen.getByText('Resposta nova')).toBeInTheDocument();
  });
});

describe('DemandasPage — exportação', () => {
  it('entrega ao botão de exportar os filtros aplicados, sem paginação', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(chamadasDemandas()).toHaveLength(1));
    expect(screen.getByTestId('exportar')).toHaveAttribute('data-filtros', '');

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'RECEBIDA' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GD-7' } });

    await waitFor(() => {
      const filtros = screen.getByTestId('exportar').getAttribute('data-filtros')!;
      const params = new URLSearchParams(filtros);
      expect(params.get('status')).toBe('RECEBIDA');
      expect(params.get('codigoInterno')).toBe('GD-7');
      expect(params.has('pagina')).toBe(false);
      expect(params.has('tamanhoPagina')).toBe(false);
    });
  });

  it('desabilita a exportação enquanto o texto digitado ainda não foi aplicado', async () => {
    mockApi();

    render(<DemandasPage />);
    await waitFor(() => expect(screen.getByTestId('exportar')).toHaveAttribute('data-desabilitado', 'false'));

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GD-7' } });
    expect(screen.getByTestId('exportar')).toHaveAttribute('data-desabilitado', 'true');

    await waitFor(() => expect(screen.getByTestId('exportar')).toHaveAttribute('data-desabilitado', 'false'));
    expect(screen.getByTestId('exportar')).toHaveAttribute('data-filtros', 'codigoInterno=GD-7');
  });
});
