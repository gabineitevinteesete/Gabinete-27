import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ListaTiposDemanda } from './ListaTiposDemanda';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

const tipoAtivo = {
  id: 't1',
  nome: 'Tapa-buraco',
  exigeDescricaoObrigatoria: false,
  ativo: true,
};

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ListaTiposDemanda', () => {
  it('lista e permite desativar', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce([tipoAtivo])
      .mockResolvedValueOnce({ ...tipoAtivo, ativo: false });

    render(<ListaTiposDemanda />);

    expect(await screen.findByText('Tapa-buraco')).toBeInTheDocument();
    const [urlBusca] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(urlBusca).toBe('/tipos-demanda/todos');

    fireEvent.click(screen.getByRole('button', { name: 'Desativar Tapa-buraco' }));

    await waitFor(() => expect(screen.getByText('Inativo')).toBeInTheDocument());
    const [url, options] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toBe('/tipos-demanda/t1/ativo');
    expect(options?.body).toEqual({ ativo: false });
  });

  it('abre o modal de edição pré-preenchido ao clicar em Editar', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([tipoAtivo]);

    render(<ListaTiposDemanda />);

    expect(await screen.findByText('Tapa-buraco')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Tapa-buraco' }));

    expect(screen.getByText('Editar tipo de demanda')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Tapa-buraco');
  });

  it('cria um novo tipo e atualiza a lista', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce([tipoAtivo])
      .mockResolvedValueOnce({ id: 't2', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true })
      .mockResolvedValueOnce([tipoAtivo, { id: 't2', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true }]);

    render(<ListaTiposDemanda />);
    await screen.findByText('Tapa-buraco');

    fireEvent.click(screen.getByRole('button', { name: '+ Novo tipo' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Outros' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Outros')).toBeInTheDocument();
  });

  it('distingue os botões de ação de cada linha pelo nome acessível', async () => {
    const outroTipo = { id: 't2', nome: 'Poda de árvore', exigeDescricaoObrigatoria: false, ativo: true };
    vi.mocked(apiClient.request).mockResolvedValueOnce([tipoAtivo, outroTipo]);

    render(<ListaTiposDemanda />);

    expect(await screen.findByText('Tapa-buraco')).toBeInTheDocument();
    expect(screen.getByText('Poda de árvore')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Editar Tapa-buraco' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Poda de árvore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar Tapa-buraco' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar Poda de árvore' })).toBeInTheDocument();
  });
});
