import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
