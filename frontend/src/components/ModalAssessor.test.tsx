import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalAssessor } from './ModalAssessor';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

const assessorFake = {
  id: 'a1',
  nome: 'Ana Rua',
  telefone: '+5534999991234',
  role: 'ASSESSOR_RUA' as const,
  ativo: true,
  pinDefinido: true,
};

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ModalAssessor (criar)', () => {
  it('mostra o seletor de papel e envia POST /usuarios ao salvar', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce(assessorFake);
    const onSalvo = vi.fn();

    render(<ModalAssessor modo="criar" onFechar={() => {}} onSalvo={onSalvo} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo Assessor' } });
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '34999998888' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith(assessorFake));
    const [url, options] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toBe('/usuarios');
    expect(options?.method).toBe('POST');
  });
});

describe('ModalAssessor (editar)', () => {
  it('pré-preenche nome e telefone, sem seletor de papel, e envia PATCH', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ ...assessorFake, nome: 'Ana Corrigida' });
    const onSalvo = vi.fn();

    render(<ModalAssessor modo="editar" assessor={assessorFake} onFechar={() => {}} onSalvo={onSalvo} />);

    expect(screen.getByLabelText('Nome')).toHaveValue('Ana Rua');
    expect(screen.getByLabelText('Telefone')).toHaveValue('(34) 99999-1234');
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana Corrigida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    const [url, options] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toBe('/usuarios/a1');
    expect(options?.method).toBe('PATCH');
  });

  it('mostra a mensagem de erro da API quando salvar falha', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(409, 'Já existe um usuário com esse telefone'));

    render(<ModalAssessor modo="editar" assessor={assessorFake} onFechar={() => {}} onSalvo={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe um usuário com esse telefone')).toBeInTheDocument();
  });
});
