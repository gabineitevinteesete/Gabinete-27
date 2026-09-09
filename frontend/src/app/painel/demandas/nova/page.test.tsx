import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NovaDemandaPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/components/PhotoUploader', () => ({
  PhotoUploader: ({ onChange }: { onChange: (fotos: unknown[]) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          { id: '1', blob: new Blob(['a']), previewUrl: 'blob:1' },
          { id: '2', blob: new Blob(['b']), previewUrl: 'blob:2' },
        ])
      }
    >
      Simular 2 fotos
    </button>
  ),
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

beforeEach(() => {
  push.mockReset();
  vi.mocked(apiClient.request).mockReset();
  vi.mocked(apiClient.request).mockResolvedValueOnce([
    { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false },
  ]);
});

async function preencherCamposObrigatorios() {
  fireEvent.click(screen.getByText('Simular 2 fotos'));
  fireEvent.click(await screen.findByText('Tapa-buraco'));
  fireEvent.change(screen.getByLabelText(/nome do solicitante/i), { target: { value: 'Maria Solicitante' } });
  fireEvent.change(screen.getByLabelText(/telefone do solicitante/i), { target: { value: '34999990000' } });
  fireEvent.change(screen.getByLabelText(/local exato/i), { target: { value: 'Em frente ao 100' } });
  fireEvent.change(screen.getByLabelText(/título resumido/i), { target: { value: 'Buraco na rua' } });
  fireEvent.change(screen.getByLabelText(/descrição/i), { target: { value: 'Buraco grande' } });
  fireEvent.click(screen.getByLabelText(/autorizo o uso/i));
}

describe('NovaDemandaPage', () => {
  it('carrega os tipos de demanda e exibe como chips', async () => {
    render(<NovaDemandaPage />);
    expect(await screen.findByText('Tapa-buraco')).toBeInTheDocument();
  });

  it('envia a demanda como FormData e navega para o detalhe ao ter sucesso', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ id: 'demanda-123' });

    render(<NovaDemandaPage />);
    await preencherCamposObrigatorios();

    fireEvent.click(screen.getByRole('button', { name: /enviar demanda/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/painel/demandas/demanda-123'));

    const chamada = vi.mocked(apiClient.request).mock.calls[1];
    expect(chamada?.[0]).toBe('/demandas');
    expect((chamada?.[1] as { body: FormData }).body).toBeInstanceOf(FormData);
  });

  it('mostra erro quando o envio falha', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(400, 'Envie de 2 a 4 fotos'));

    render(<NovaDemandaPage />);
    await preencherCamposObrigatorios();

    fireEvent.click(screen.getByRole('button', { name: /enviar demanda/i }));

    expect(await screen.findByText('Envie de 2 a 4 fotos')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
