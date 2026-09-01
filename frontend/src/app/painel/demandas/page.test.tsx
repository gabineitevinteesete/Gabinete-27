import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DemandasPage from './page';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
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

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('DemandasPage', () => {
  it('lista as demandas retornadas pela API', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({
      items: [itemFake()], total: 1, pagina: 1, tamanhoPagina: 20,
    });

    render(<DemandasPage />);

    expect(await screen.findByText('Buraco na rua')).toBeInTheDocument();
    expect(screen.getByText(/Maria/)).toBeInTheDocument();
  });

  it('refaz a busca quando o filtro de bairro muda', async () => {
    vi.mocked(apiClient.request).mockResolvedValue({ items: [], total: 0, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/bairro/i), { target: { value: 'Centro' } });

    // O filtro é debounced (350ms), então a busca não sai no mesmo tick da digitação.
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toContain('bairro=Centro');
  });

  it('não dispara uma requisição por tecla digitada no filtro de bairro', async () => {
    vi.mocked(apiClient.request).mockResolvedValue({ items: [], total: 0, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));

    const campo = screen.getByLabelText(/bairro/i);
    fireEvent.change(campo, { target: { value: 'C' } });
    fireEvent.change(campo, { target: { value: 'Ce' } });
    fireEvent.change(campo, { target: { value: 'Cen' } });
    fireEvent.change(campo, { target: { value: 'Centro' } });

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toContain('bairro=Centro');
  });

  it('mostra mensagem quando não há demandas', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [], total: 0, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);

    expect(await screen.findByText(/nenhuma demanda encontrada/i)).toBeInTheDocument();
  });
});
