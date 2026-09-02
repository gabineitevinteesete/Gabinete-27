import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReatribuirDemanda } from './ReatribuirDemanda';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

const usuarios = [
  { id: 'u1', nome: 'Ana', telefone: '+5534988880001', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true },
  { id: 'u2', nome: 'Bruno', telefone: '+5534988880002', role: 'ASSESSOR_GABINETE', ativo: true, pinDefinido: true },
  { id: 'u3', nome: 'Chefia', telefone: '+5534988880003', role: 'CHEFE', ativo: true, pinDefinido: true },
];

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
  vi.mocked(apiClient.request).mockResolvedValueOnce(usuarios);
});

describe('ReatribuirDemanda', () => {
  it('lista os assessores ativos, exceto o atual', async () => {
    render(<ReatribuirDemanda demandaId="d1" assessorAtualId="u1" onReatribuido={() => {}} />);

    expect(await screen.findByText('Bruno')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('não oferece um chefe como destino da reatribuição', async () => {
    render(<ReatribuirDemanda demandaId="d1" assessorAtualId="u1" onReatribuido={() => {}} />);

    await screen.findByText('Bruno');
    expect(screen.queryByText('Chefia')).not.toBeInTheDocument();
  });

  it('reatribui ao escolher um assessor e confirmar', async () => {
    const onReatribuido = vi.fn();
    vi.mocked(apiClient.request).mockResolvedValueOnce({ id: 'd1', assessorResponsavelId: 'u2' });
    render(<ReatribuirDemanda demandaId="d1" assessorAtualId="u1" onReatribuido={onReatribuido} />);

    fireEvent.change(await screen.findByLabelText(/reatribuir/i), { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(onReatribuido).toHaveBeenCalledWith({ id: 'd1', assessorResponsavelId: 'u2' }));
    expect(apiClient.request).toHaveBeenLastCalledWith('/demandas/d1/reatribuir', {
      method: 'PATCH',
      auth: true,
      body: { novoAssessorId: 'u2' },
    });
  });

  it('limpa a seleção depois de reatribuir, para não reenviar a mesma reatribuição', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({
      id: 'd1',
      assessorResponsavelId: 'u2',
      assessorResponsavelNome: 'Bruno',
    });
    render(<ReatribuirDemanda demandaId="d1" assessorAtualId="u1" onReatribuido={() => {}} />);

    fireEvent.change(await screen.findByLabelText(/reatribuir/i), { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled());
    expect(await screen.findByLabelText(/reatribuir/i)).toHaveValue('');
  });

  it('mostra erro quando a API rejeita', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(400, 'Assessor inválido ou inativo'));
    render(<ReatribuirDemanda demandaId="d1" assessorAtualId="u1" onReatribuido={() => {}} />);

    fireEvent.change(await screen.findByLabelText(/reatribuir/i), { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(await screen.findByText('Assessor inválido ou inativo')).toBeInTheDocument();
  });
});
