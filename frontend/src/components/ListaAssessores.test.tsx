import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ListaAssessores } from './ListaAssessores';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

const assessorRua = {
  id: 'a1',
  nome: 'Ana Rua',
  telefone: '+5534999991111',
  role: 'ASSESSOR_RUA' as const,
  ativo: true,
  pinDefinido: true,
};

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ListaAssessores — assessor de rua', () => {
  it('lista e permite desativar', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce([assessorRua])
      .mockResolvedValueOnce({ ...assessorRua, ativo: false });

    render(<ListaAssessores />);

    expect(await screen.findByText('Ana Rua')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));

    await waitFor(() => expect(screen.getByText('Inativo')).toBeInTheDocument());
    const [url, options] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toBe('/usuarios/a1/ativo');
    expect(options?.body).toEqual({ ativo: false });
  });

  it('filtro de papel dispara nova busca com o parâmetro certo', async () => {
    vi.mocked(apiClient.request).mockResolvedValue([]);

    render(<ListaAssessores />);
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Papel'), { target: { value: 'ASSESSOR_RUA' } });

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toContain('role=ASSESSOR_RUA');
  });
});

describe('ListaAssessores — chefe', () => {
  const chefe = {
    id: 'c1',
    nome: 'Chefe Um',
    telefone: '+5534999992222',
    role: 'CHEFE' as const,
    ativo: true,
    pinDefinido: true,
  };

  it('mostra a mensagem de erro da API ao tentar desativar o último chefe ativo', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce([chefe])
      .mockRejectedValueOnce(new ApiError(409, 'Não é possível remover o último chefe ativo do gabinete'));

    render(<ListaAssessores />);

    expect(await screen.findByText('Chefe Um')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));

    expect(await screen.findByText('Não é possível remover o último chefe ativo do gabinete')).toBeInTheDocument();
  });
});

describe('ListaAssessores — assessor de gabinete', () => {
  const gabinete = {
    id: 'g1',
    nome: 'Beto Gabinete',
    telefone: '+5534999993333',
    role: 'ASSESSOR_GABINETE' as const,
    ativo: true,
    pinDefinido: true,
  };

  it('abre o modal de edição pré-preenchido ao clicar em Editar', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([gabinete]);

    render(<ListaAssessores />);

    expect(await screen.findByText('Beto Gabinete')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByText('Editar assessor')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Beto Gabinete');
  });
});
