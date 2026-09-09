import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PainelDiaEscala } from './PainelDiaEscala';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

const atribuicoesFake = [{ userId: 'a1', userNome: 'Ana', local: 'RUA' as const }];

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('PainelDiaEscala (somente leitura)', () => {
  it('mostra a lista de atribuições sem controles de edição', () => {
    render(
      <PainelDiaEscala
        data="2026-09-15"
        atribuicoes={atribuicoesFake}
        podeEditar={false}
        onFechar={() => {}}
        onSalvo={() => {}}
      />,
    );

    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });

  it('mostra mensagem quando não há ninguém escalado', () => {
    render(
      <PainelDiaEscala data="2026-09-15" atribuicoes={[]} podeEditar={false} onFechar={() => {}} onSalvo={() => {}} />,
    );

    expect(screen.getByText(/ninguém escalado/i)).toBeInTheDocument();
  });
});

describe('PainelDiaEscala (edição, chefe)', () => {
  it('carrega os assessores ativos e pré-seleciona quem já está escalado', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([
      { id: 'a1', nome: 'Ana', telefone: '1', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true },
      { id: 'a2', nome: 'Beto', telefone: '2', role: 'ASSESSOR_GABINETE', ativo: true, pinDefinido: true },
    ]);

    render(
      <PainelDiaEscala
        data="2026-09-15"
        atribuicoes={atribuicoesFake}
        podeEditar
        onFechar={() => {}}
        onSalvo={() => {}}
      />,
    );

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByLabelText('Ana')).toHaveValue('RUA');
    expect(screen.getByLabelText('Beto')).toHaveValue('');
  });

  it('salva as seleções e chama onSalvo', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([
      { id: 'a1', nome: 'Ana', telefone: '1', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true },
    ]);
    vi.mocked(apiClient.request).mockResolvedValueOnce(undefined);
    const onSalvo = vi.fn();

    render(<PainelDiaEscala data="2026-09-15" atribuicoes={[]} podeEditar onFechar={() => {}} onSalvo={onSalvo} />);

    await screen.findByText('Ana');
    fireEvent.change(screen.getByLabelText('Ana'), { target: { value: 'GABINETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(onSalvo).toHaveBeenCalledWith('2026-09-15', [{ userId: 'a1', local: 'GABINETE', userNome: 'Ana' }]),
    );
    const [url, options] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toBe('/escala/2026-09-15');
    expect(options?.method).toBe('PUT');
    expect(options?.body).toEqual({ atribuicoes: [{ userId: 'a1', local: 'GABINETE' }] });
  });
});
