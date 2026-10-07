import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportarDemandas } from './ExportarDemandas';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, requestBlob: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

let nomeBaixado: string | null;

beforeEach(() => {
  nomeBaixado = null;
  vi.mocked(apiClient.requestBlob).mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    nomeBaixado = this.download;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExportarDemandas', () => {
  it('não aparece para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });

    render(<ExportarDemandas filtros="" />);

    expect(screen.queryByRole('button', { name: 'Exportar planilha' })).not.toBeInTheDocument();
  });

  it('baixa o arquivo com os filtros recebidos e nome demandas-AAAA-MM-DD.csv', async () => {
    vi.mocked(apiClient.requestBlob).mockResolvedValueOnce(new Blob(['x']));

    render(<ExportarDemandas filtros="status=RECEBIDA&bairro=Centro" />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar planilha' }));

    await waitFor(() => expect(nomeBaixado).toMatch(/^demandas-\d{4}-\d{2}-\d{2}\.csv$/));
    expect(apiClient.requestBlob).toHaveBeenCalledWith('/demandas/exportar?status=RECEBIDA&bairro=Centro', { auth: true });
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake'));
  });

  it('sem filtros chama a rota sem query string', async () => {
    vi.mocked(apiClient.requestBlob).mockResolvedValueOnce(new Blob(['x']));

    render(<ExportarDemandas filtros="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar planilha' }));

    await waitFor(() => expect(apiClient.requestBlob).toHaveBeenCalledWith('/demandas/exportar', { auth: true }));
  });

  it('desabilita o botão enquanto exporta', async () => {
    let resolver: (b: Blob) => void = () => {};
    vi.mocked(apiClient.requestBlob).mockImplementationOnce(() => new Promise((resolve) => (resolver = resolve)));

    render(<ExportarDemandas filtros="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar planilha' }));

    const botao = await screen.findByRole('button', { name: 'Exportando…' });
    expect(botao).toBeDisabled();

    resolver(new Blob(['x']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar planilha' })).toBeEnabled());
  });

  it('fica desabilitado quando a lista ainda não refletiu os filtros digitados', () => {
    render(<ExportarDemandas filtros="" desabilitado />);

    expect(screen.getByRole('button', { name: 'Exportar planilha' })).toBeDisabled();
  });

  it('mostra a mensagem do backend quando a exportação falha', async () => {
    vi.mocked(apiClient.requestBlob).mockRejectedValueOnce(
      new ApiError(400, 'Muitos resultados (6000). O limite é de 5000 linhas; refine os filtros.'),
    );

    render(<ExportarDemandas filtros="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar planilha' }));

    expect(await screen.findByText(/Muitos resultados \(6000\)/)).toBeInTheDocument();
    expect(nomeBaixado).toBeNull();
  });

  it('mostra mensagem genérica para erro inesperado', async () => {
    vi.mocked(apiClient.requestBlob).mockRejectedValueOnce(new Error('rede'));

    render(<ExportarDemandas filtros="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar planilha' }));

    expect(await screen.findByText('Não foi possível exportar. Tente novamente.')).toBeInTheDocument();
  });
});
