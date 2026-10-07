import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NovaDemandaPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

const adicionarPendente = vi.fn();
vi.mock('@/lib/fila-offline', () => ({ adicionarPendente: (...args: unknown[]) => adicionarPendente(...args) }));

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

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  adicionarPendente.mockReset().mockResolvedValue({ id: 'p1' });
  push.mockReset();
  vi.mocked(apiClient.request).mockReset();
  // Depois de guardar offline o formulário é recriado e busca os tipos de novo.
  vi.mocked(apiClient.request).mockImplementation((async (url: string) =>
    url === '/tipos-demanda'
      ? [{ id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false }]
      : undefined) as unknown as typeof apiClient.request);
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
    expect(adicionarPendente).not.toHaveBeenCalled();
  });

  it('abre e fecha o modal do aviso de privacidade', async () => {
    render(<NovaDemandaPage />);
    await screen.findByText('Tapa-buraco');

    fireEvent.click(screen.getByRole('button', { name: 'Ver aviso de privacidade' }));
    expect(screen.getByText('Aviso de privacidade')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByText('Aviso de privacidade')).not.toBeInTheDocument();
  });
});

describe('NovaDemandaPage — sem internet', () => {
  it('quando o envio falha por falta de rede, guarda no aparelho, avisa e limpa o formulário', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<NovaDemandaPage />);
    await preencherCamposObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: /enviar demanda/i }));

    expect(await screen.findByText(/Demanda salva no celular\. Será enviada quando houver sinal\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver pendentes' })).toHaveAttribute('href', '/painel/demandas/pendentes');
    expect(push).not.toHaveBeenCalled();

    expect(adicionarPendente).toHaveBeenCalledTimes(1);
    const entrada = adicionarPendente.mock.calls[0]![0] as { usuarioId: string; campos: Record<string, string>; fotos: Blob[] };
    expect(entrada.usuarioId).toBe('u1');
    expect(entrada.campos).toMatchObject({
      solicitanteNome: 'Maria Solicitante',
      solicitanteTelefone: '34999990000',
      localExato: 'Em frente ao 100',
      tituloResumido: 'Buraco na rua',
      descricao: 'Buraco grande',
      requestTypeId: 'tipo-1',
      autorizacaoDados: 'true',
    });
    expect(entrada.campos).not.toHaveProperty('cep');
    expect(entrada.fotos).toHaveLength(2);

    expect(screen.getByLabelText(/nome do solicitante/i)).toHaveValue('');
  });

  it('com o aparelho sem rede, nem tenta enviar: guarda direto', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);

    render(<NovaDemandaPage />);
    await preencherCamposObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: /enviar demanda/i }));

    expect(await screen.findByText(/Demanda salva no celular/)).toBeInTheDocument();
    expect(adicionarPendente).toHaveBeenCalledTimes(1);
    // Só a busca dos tipos de demanda aconteceu; nenhum POST /demandas.
    expect(vi.mocked(apiClient.request).mock.calls.filter(([url]) => url === '/demandas')).toHaveLength(0);
  });

  it('se não conseguir guardar no aparelho, mostra o erro e não perde o formulário', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    adicionarPendente.mockRejectedValueOnce(new Error('quota'));

    render(<NovaDemandaPage />);
    await preencherCamposObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: /enviar demanda/i }));

    expect(await screen.findByText(/não foi possível guardar a demanda neste aparelho/i)).toBeInTheDocument();
    expect(screen.queryByText(/Demanda salva no celular/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nome do solicitante/i)).toHaveValue('Maria Solicitante');
  });

  it('guarda os tipos de demanda carregados para uso offline', async () => {
    render(<NovaDemandaPage />);
    await screen.findByText('Tapa-buraco');

    expect(JSON.parse(localStorage.getItem('gd:tipos-demanda')!)).toEqual([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false },
    ]);
  });

  it('sem rede, usa a cópia guardada dos tipos de demanda', async () => {
    localStorage.setItem(
      'gd:tipos-demanda',
      JSON.stringify([{ id: 'tipo-9', nome: 'Poda de árvore', exigeDescricaoObrigatoria: false }]),
    );
    vi.mocked(apiClient.request).mockReset();
    vi.mocked(apiClient.request).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<NovaDemandaPage />);

    expect(await screen.findByText('Poda de árvore')).toBeInTheDocument();
  });
});
