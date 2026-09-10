import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalTipoDemanda } from './ModalTipoDemanda';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

const tipoFake = {
  id: 't1',
  nome: 'Tapa-buraco',
  exigeDescricaoObrigatoria: false,
  ativo: true,
};

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ModalTipoDemanda (criar)', () => {
  it('envia POST /tipos-demanda ao salvar', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce(tipoFake);
    const onSalvo = vi.fn();

    render(<ModalTipoDemanda modo="criar" onFechar={() => {}} onSalvo={onSalvo} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Tapa-buraco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith(tipoFake));
    const [url, options] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toBe('/tipos-demanda');
    expect(options?.method).toBe('POST');
    expect(options?.body).toEqual({ nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false });
  });

  it('envia exigeDescricaoObrigatoria true quando o checkbox é marcado', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ ...tipoFake, exigeDescricaoObrigatoria: true });

    render(<ModalTipoDemanda modo="criar" onFechar={() => {}} onSalvo={() => {}} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Outros' } });
    fireEvent.click(screen.getByLabelText('Exige descrição obrigatória'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(apiClient.request).toHaveBeenCalled());
    const [, options] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(options?.body).toEqual({ nome: 'Outros', exigeDescricaoObrigatoria: true });
  });
});

describe('ModalTipoDemanda (editar)', () => {
  it('pré-preenche nome e exigência, e envia PATCH', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ ...tipoFake, nome: 'Tapa-buraco Corrigido' });
    const onSalvo = vi.fn();

    render(<ModalTipoDemanda modo="editar" tipo={tipoFake} onFechar={() => {}} onSalvo={onSalvo} />);

    expect(screen.getByLabelText('Nome')).toHaveValue('Tapa-buraco');
    expect(screen.getByLabelText('Exige descrição obrigatória')).not.toBeChecked();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Tapa-buraco Corrigido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    const [url, options] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toBe('/tipos-demanda/t1');
    expect(options?.method).toBe('PATCH');
  });

  it('mostra a mensagem de erro da API quando salvar falha', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(409, 'Já existe um tipo de demanda com esse nome'));

    render(<ModalTipoDemanda modo="editar" tipo={tipoFake} onFechar={() => {}} onSalvo={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe um tipo de demanda com esse nome')).toBeInTheDocument();
  });
});
