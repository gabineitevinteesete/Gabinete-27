import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RelatorioPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

const CHEFE = { id: 'c1', nome: 'Chefe Silva', role: 'CHEFE' };

function status(sobrescritas: Record<string, number> = {}) {
  const todos = ['RASCUNHO', 'ENVIADA', 'RECEBIDA', 'EM_CONFERENCIA', 'PENDENTE_INFORMACAO', 'PROTOCOLADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'ARQUIVADA', 'RECUSADA'];
  return todos.map((s) => ({ status: s, quantidade: sobrescritas[s] ?? 0 }));
}

function relatorio(overrides: Record<string, unknown> = {}) {
  return {
    de: '2026-10-01',
    ate: '2026-10-31',
    total: 7,
    porStatus: status({ ENVIADA: 4, CONCLUIDA: 3 }),
    porTipo: [
      { tipo: 'Tapa-buraco', quantidade: 5 },
      { tipo: 'Poda de árvore', quantidade: 2 },
    ],
    porBairro: [
      { bairro: 'Centro', quantidade: 4 },
      { bairro: 'Sem bairro', quantidade: 3 },
    ],
    porAssessor: [{ assessorId: 'a1', assessorNome: 'Ana Rua', quantidade: 7 }],
    ...overrides,
  };
}

function chamadas() {
  return vi.mocked(apiClient.request).mock.calls.map(([url]) => String(url));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T15:00:00'));
  useAuthMock.mockReturnValue({ user: CHEFE });
  vi.mocked(apiClient.request).mockReset();
  vi.mocked(apiClient.request).mockResolvedValue(relatorio());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RelatorioPage', () => {
  it('bloqueia quem não é chefe, sem chamar a API', () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', nome: 'Ana', role: 'ASSESSOR_RUA' } });

    render(<RelatorioPage />);

    expect(screen.getByText('Acesso restrito ao chefe.')).toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('abre com o mês atual (do dia 1º até hoje) e busca o relatório', async () => {
    render(<RelatorioPage />);

    await screen.findByText('Relatório de demandas');
    expect(chamadas()).toEqual(['/dashboard/relatorio?de=2026-10-01&ate=2026-10-14']);
    expect(screen.getByLabelText('De')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Até')).toHaveValue('2026-10-14');
  });

  it('mostra período por extenso, total e as quatro tabelas', async () => {
    render(<RelatorioPage />);

    expect(await screen.findByText(/Demandas registradas de 01\/10\/2026 a 31\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText('7', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Por status (situação atual)')).toBeInTheDocument();
    expect(screen.getByText('Por tipo de demanda')).toBeInTheDocument();
    expect(screen.getByText('Por bairro')).toBeInTheDocument();
    expect(screen.getByText('Por assessor responsável')).toBeInTheDocument();

    const tabelaStatus = screen.getByText('Por status (situação atual)').closest('section')!;
    expect(within(tabelaStatus).getByText('Enviada').nextSibling).toHaveTextContent('4');
    expect(within(tabelaStatus).getByText('Concluída').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('Tapa-buraco')).toBeInTheDocument();
    expect(screen.getByText('Ana Rua')).toBeInTheDocument();
    expect(screen.getByText('Sem bairro')).toBeInTheDocument();
  });

  it('rodapé com a data da geração e o nome do chefe', async () => {
    render(<RelatorioPage />);

    expect(await screen.findByText(/Gerado em 14\/10\/2026.* por Chefe Silva\./)).toBeInTheDocument();
  });

  it('soma em "Outros" os bairros além dos 15 maiores', async () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({ bairro: `Bairro ${i + 1}`, quantidade: 20 - i }));
    vi.mocked(apiClient.request).mockResolvedValue(relatorio({ porBairro: muitos, total: 210 }));

    render(<RelatorioPage />);

    const tabela = (await screen.findByText('Por bairro')).closest('section')!;
    expect(within(tabela).getByText('Bairro 15')).toBeInTheDocument();
    expect(within(tabela).queryByText('Bairro 16')).not.toBeInTheDocument();
    // 5 bairros restantes: 5+4+3+2+1 = 15
    expect(within(tabela).getByText('Outros').nextSibling).toHaveTextContent('15');
  });

  it('período sem demandas mostra a mensagem em vez de tabelas vazias', async () => {
    vi.mocked(apiClient.request).mockResolvedValue(relatorio({ total: 0, porStatus: status(), porTipo: [], porBairro: [], porAssessor: [] }));

    render(<RelatorioPage />);

    await screen.findByText('Relatório de demandas');
    expect(screen.getAllByText('Nenhuma demanda no período.').length).toBeGreaterThanOrEqual(3);
  });

  it('mudar as datas busca de novo com o novo período', async () => {
    render(<RelatorioPage />);
    await screen.findByText('Relatório de demandas');

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-01' } });

    await waitFor(() => expect(chamadas()).toContain('/dashboard/relatorio?de=2026-09-01&ate=2026-10-14'));
  });

  it.each([
    ['2026-10-20', '2026-10-10', 'A data final não pode ser anterior à inicial.'],
    ['2025-01-01', '2026-10-14', 'O período pode ter no máximo 366 dias.'],
    ['', '2026-10-14', 'Informe as duas datas.'],
  ])('período inválido (%s a %s) mostra aviso e não chama a API', async (de, ate, mensagem) => {
    render(<RelatorioPage />);
    await screen.findByText('Relatório de demandas');
    vi.mocked(apiClient.request).mockClear();

    fireEvent.change(screen.getByLabelText('De'), { target: { value: de } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: ate } });

    expect(screen.getByText(mensagem)).toBeInTheDocument();
    expect(screen.queryByText('Relatório de demandas')).not.toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Imprimir / salvar em PDF' })).toBeDisabled();
  });

  it('mostra a mensagem do servidor quando a busca falha e limpa o relatório antigo', async () => {
    vi.mocked(apiClient.request).mockRejectedValue(new ApiError(400, 'O período pode ter no máximo 366 dias.'));

    render(<RelatorioPage />);

    expect(await screen.findByText('O período pode ter no máximo 366 dias.')).toBeInTheDocument();
    expect(screen.queryByText('Relatório de demandas')).not.toBeInTheDocument();
  });

  it('erro de rede mostra a mensagem genérica', async () => {
    vi.mocked(apiClient.request).mockRejectedValue(new TypeError('Failed to fetch'));

    render(<RelatorioPage />);

    expect(await screen.findByText('Não foi possível carregar o relatório. Tente novamente.')).toBeInTheDocument();
  });

  it('o botão de imprimir chama window.print só depois de o relatório carregar', async () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<RelatorioPage />);
    const botao = screen.getByRole('button', { name: 'Imprimir / salvar em PDF' });
    expect(botao).toBeDisabled();

    await screen.findByText('Relatório de demandas');
    fireEvent.click(botao);

    expect(botao).toBeEnabled();
    expect(imprimir).toHaveBeenCalledTimes(1);
  });

  it('os controles da tela somem na impressão (classe print:hidden)', async () => {
    render(<RelatorioPage />);
    await screen.findByText('Relatório de demandas');

    const controles = screen.getByLabelText('De').closest('div.print\\:hidden');
    expect(controles).not.toBeNull();
  });
});
