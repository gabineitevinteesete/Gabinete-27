import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DemandaDetalhePage from './page';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'demanda-1' }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

vi.mock('@/components/StatusActions', () => ({
  StatusActions: ({
    statusAtual,
    onStatusAlterado,
  }: {
    statusAtual: string;
    onStatusAlterado: (demanda: Record<string, unknown>) => void;
  }) => (
    <div>
      <span>Ações de status ({statusAtual})</span>
      <button
        type="button"
        onClick={() => onStatusAlterado({ status: 'RECEBIDA', assessorResponsavelNome: 'Assessor Novo' })}
      >
        simular mudança de status
      </button>
    </div>
  ),
}));
vi.mock('@/components/HistoricoStatus', () => ({
  HistoricoStatus: ({ versao }: { versao?: number }) => (
    <div>
      <span>Histórico de status</span>
      <span>{`versão do histórico: ${versao}`}</span>
    </div>
  ),
}));
vi.mock('@/components/ReatribuirDemanda', () => ({
  ReatribuirDemanda: () => <div>Reatribuir demanda</div>,
}));

function demandaFake(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demanda-1', codigoInterno: 'GD-1', tituloResumido: 'Buraco na rua', solicitanteNome: 'Maria',
    solicitanteTelefone: '+5534999990000', solicitanteNascimento: null, bairro: 'Centro', cep: null,
    rua: null, numero: null, complemento: null, cidade: null, estado: null, pontoReferencia: null,
    localExato: 'Em frente ao 100', status: 'ENVIADA', assessorResponsavelId: 'user-dono',
    assessorResponsavelNome: 'Assessor', requestTypeId: 'tipo-1', requestTypeNome: 'Tapa-buraco', numeroProtocolo: null,
    descricao: 'Descrição detalhada', descricaoOutroAssunto: null, autorizacaoDados: true,
    createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z',
    fotos: [{ id: 'f1', url: 'https://cdn/a.jpg', larguraPx: 800, alturaPx: 600 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('DemandaDetalhePage', () => {
  it('mostra os dados da demanda e a galeria de fotos', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-dono', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);

    expect(await screen.findByText('Buraco na rua')).toBeInTheDocument();
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('mostra o botão Editar quando o dono ainda pode editar', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-dono', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake({ status: 'ENVIADA' }));

    render(<DemandaDetalhePage />);

    expect(await screen.findByRole('link', { name: /editar/i })).toHaveAttribute('href', '/painel/demandas/demanda-1/editar');
  });

  it('não mostra o botão Editar para o assessor de rua depois de protocolada', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-dono', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake({ status: 'PROTOCOLADA' }));

    render(<DemandaDetalhePage />);
    await screen.findByText('Buraco na rua');

    expect(screen.queryByRole('link', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('gabinete vê o botão Editar mesmo depois de protocolada', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake({ status: 'PROTOCOLADA' }));

    render(<DemandaDetalhePage />);

    expect(await screen.findByRole('link', { name: /editar/i })).toBeInTheDocument();
  });

  it('mostra as ações de status e o histórico para gabinete', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);

    expect(await screen.findByText(/Ações de status/)).toBeInTheDocument();
    expect(screen.getByText('Histórico de status')).toBeInTheDocument();
  });

  it('não mostra ações de status para assessor de rua', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-dono', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);
    await screen.findByText('Buraco na rua');

    expect(screen.queryByText(/Ações de status/)).not.toBeInTheDocument();
    expect(screen.getByText('Histórico de status')).toBeInTheDocument();
  });

  it('mostra reatribuir só para o chefe', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);

    expect(await screen.findByText('Reatribuir demanda')).toBeInTheDocument();
  });

  it('não mostra reatribuir para gabinete', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);
    await screen.findByText('Buraco na rua');

    expect(screen.queryByText('Reatribuir demanda')).not.toBeInTheDocument();
  });

  it('mostra o status atual da demanda', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-dono', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake({ status: 'EM_CONFERENCIA' }));

    render(<DemandaDetalhePage />);

    expect(await screen.findByText('Em conferência')).toBeInTheDocument();
  });

  it('atualiza o status na tela e força o refetch do histórico depois de uma mudança', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);
    expect(await screen.findByText('Enviada')).toBeInTheDocument();
    expect(screen.getByText('versão do histórico: 0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /simular mudança de status/i }));

    await waitFor(() => expect(screen.getByText('Recebida')).toBeInTheDocument());
    expect(screen.getByText('versão do histórico: 1')).toBeInTheDocument();
    // A resposta do PATCH é mesclada inteira, então campos como o nome do responsável
    // acompanham a mudança em vez de ficarem congelados no valor antigo.
    expect(screen.getByText('Assessor Novo')).toBeInTheDocument();
  });
});
