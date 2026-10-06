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

describe('BuscaCidadao — total e botões travados', () => {
  const demandaDois = {
    ...demandaFake,
    id: 'd2',
    solicitanteNome: 'João Solicitante',
    tituloResumido: 'Poste queimado',
  };

  async function buscarTelefone() {
    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  }

  it('avisa quando o total é maior que os resultados exibidos', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [demandaFake, demandaDois], total: 37 });

    render(<BuscaCidadao />);
    await buscarTelefone();

    expect(
      await screen.findByText('Mostrando 2 de 37 demandas. Anonimize estas e busque de novo para ver as demais.'),
    ).toBeInTheDocument();
  });

  it('não mostra o aviso quando o total é igual aos resultados exibidos', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [demandaFake, demandaDois], total: 2 });

    render(<BuscaCidadao />);
    await buscarTelefone();
    await screen.findByText('Buraco na rua');

    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
  });

  it('decrementa o total depois de anonimizar uma demanda', async () => {
    confirmSpy.mockReturnValue(true);
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ items: [demandaFake, demandaDois], total: 3 })
      .mockResolvedValueOnce({ status: 'ok' });

    render(<BuscaCidadao />);
    await buscarTelefone();
    await screen.findByText('Mostrando 2 de 3 demandas. Anonimize estas e busque de novo para ver as demais.');

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados de Maria Solicitante' }));

    expect(
      await screen.findByText('Mostrando 1 de 2 demandas. Anonimize estas e busque de novo para ver as demais.'),
    ).toBeInTheDocument();
  });

  it('desabilita os botões das outras linhas enquanto uma anonimização está em andamento', async () => {
    confirmSpy.mockReturnValue(true);
    let resolverAnonimizacao: (valor: unknown) => void = () => {};
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ items: [demandaFake, demandaDois], total: 2 })
      .mockImplementationOnce(() => new Promise((resolve) => (resolverAnonimizacao = resolve)));

    render(<BuscaCidadao />);
    await buscarTelefone();
    await screen.findByText('Buraco na rua');

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados de Maria Solicitante' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Anonimizar dados de João Solicitante' })).toBeDisabled(),
    );

    resolverAnonimizacao({ status: 'ok' });
    await waitFor(() => expect(screen.queryByText('Buraco na rua')).not.toBeInTheDocument());
  });
});
