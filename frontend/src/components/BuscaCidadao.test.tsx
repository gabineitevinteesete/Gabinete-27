import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BuscaCidadao } from './BuscaCidadao';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

const demandaFake = {
  id: 'd1',
  codigoInterno: 'GD-20260101-0001',
  tituloResumido: 'Buraco na rua',
  solicitanteNome: 'Maria Solicitante',
  bairro: 'Centro',
  status: 'ENVIADA' as const,
  assessorResponsavelId: 'a1',
  assessorResponsavelNome: 'Assessor Um',
  requestTypeId: 't1',
  requestTypeNome: 'Tapa-buraco',
  numeroProtocolo: null,
  createdAt: '2026-01-01T10:00:00.000Z',
};

const confirmSpy = vi.spyOn(window, 'confirm');

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
  confirmSpy.mockReset();
});

describe('BuscaCidadao', () => {
  it('busca por telefone e lista as demandas encontradas', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [demandaFake], total: 1 });

    render(<BuscaCidadao />);

    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('Buraco na rua')).toBeInTheDocument();
    const [url] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toContain('solicitanteTelefone=');
  });

  it('mostra mensagem quando não encontra nenhuma demanda', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [], total: 0 });

    render(<BuscaCidadao />);
    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('Nenhuma demanda encontrada para este telefone.')).toBeInTheDocument();
  });

  it('pede confirmação e remove da lista ao anonimizar com sucesso', async () => {
    confirmSpy.mockReturnValue(true);
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [demandaFake], total: 1 }).mockResolvedValueOnce({
      status: 'ok',
    });

    render(<BuscaCidadao />);
    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Buraco na rua');

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados de Maria Solicitante' }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Buraco na rua')).not.toBeInTheDocument());
    const [url, options] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toBe('/demandas/d1/anonimizar');
    expect(options?.method).toBe('PATCH');
  });

  it('não chama a API se o usuário cancelar a confirmação', async () => {
    confirmSpy.mockReturnValue(false);
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [demandaFake], total: 1 });

    render(<BuscaCidadao />);
    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Buraco na rua');

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados de Maria Solicitante' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('mostra a mensagem de erro da API quando a anonimização falha', async () => {
    confirmSpy.mockReturnValue(true);
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ items: [demandaFake], total: 1 })
      .mockRejectedValueOnce(new ApiError(404, 'Demanda não encontrada'));

    render(<BuscaCidadao />);
    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Buraco na rua');

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados de Maria Solicitante' }));

    expect(await screen.findByText('Demanda não encontrada')).toBeInTheDocument();
  });
});
