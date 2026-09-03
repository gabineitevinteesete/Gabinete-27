import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StatusActions } from './StatusActions';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('StatusActions', () => {
  it('mostra um botão para cada transição válida do status atual', () => {
    render(<StatusActions demandaId="d1" statusAtual="EM_CONFERENCIA" onStatusAlterado={() => {}} />);

    expect(screen.getByRole('button', { name: 'Pedir informação' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Protocolar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Concluir' })).not.toBeInTheDocument();
  });

  it('não mostra nenhum botão quando o status não tem transições (ARQUIVADA)', () => {
    render(<StatusActions demandaId="d1" statusAtual="ARQUIVADA" onStatusAlterado={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('chama a API direto para uma transição que não exige motivo', async () => {
    const onStatusAlterado = vi.fn();
    vi.mocked(apiClient.request).mockResolvedValueOnce({ id: 'd1', status: 'RECEBIDA' });
    render(<StatusActions demandaId="d1" statusAtual="ENVIADA" onStatusAlterado={onStatusAlterado} />);

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como recebida' }));

    await waitFor(() => expect(onStatusAlterado).toHaveBeenCalledWith({ id: 'd1', status: 'RECEBIDA' }));
    expect(apiClient.request).toHaveBeenCalledWith('/demandas/d1/status', {
      method: 'PATCH',
      auth: true,
      body: { novoStatus: 'RECEBIDA', motivo: undefined },
    });
  });

  it('abre uma caixa de motivo para RECUSADA e só envia depois de confirmado', async () => {
    const onStatusAlterado = vi.fn();
    vi.mocked(apiClient.request).mockResolvedValueOnce({ id: 'd1', status: 'RECUSADA' });
    render(<StatusActions demandaId="d1" statusAtual="ENVIADA" onStatusAlterado={onStatusAlterado} />);

    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    expect(apiClient.request).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: 'Duplicado' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(onStatusAlterado).toHaveBeenCalled());
    expect(apiClient.request).toHaveBeenCalledWith('/demandas/d1/status', {
      method: 'PATCH',
      auth: true,
      body: { novoStatus: 'RECUSADA', motivo: 'Duplicado' },
    });
  });

  it('não confirma a transição com motivo se a caixa estiver vazia', async () => {
    render(<StatusActions demandaId="d1" statusAtual="ENVIADA" onStatusAlterado={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('mostra erro quando a API rejeita', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(400, 'Transição de status inválida'));
    render(<StatusActions demandaId="d1" statusAtual="ENVIADA" onStatusAlterado={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como recebida' }));

    expect(await screen.findByText('Transição de status inválida')).toBeInTheDocument();
  });
});
