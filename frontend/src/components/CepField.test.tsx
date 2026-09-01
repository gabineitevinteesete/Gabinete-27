import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CepField } from './CepField';

vi.mock('@/lib/cep', () => ({ buscarCep: vi.fn() }));
import { buscarCep } from '@/lib/cep';

describe('CepField', () => {
  beforeEach(() => {
    vi.mocked(buscarCep).mockReset();
  });

  it('chama onEnderecoEncontrado quando o CEP é encontrado ao sair do campo', async () => {
    vi.mocked(buscarCep).mockResolvedValueOnce({
      status: 'ok',
      endereco: { rua: 'Rua das Palmeiras', bairro: 'Centro', cidade: 'Uberlândia', estado: 'MG' },
    });
    const onEnderecoEncontrado = vi.fn();

    render(<CepField value="38400-000" onChange={() => {}} onEnderecoEncontrado={onEnderecoEncontrado} />);
    fireEvent.blur(screen.getByLabelText(/cep/i));

    await waitFor(() => expect(onEnderecoEncontrado).toHaveBeenCalledWith({
      rua: 'Rua das Palmeiras', bairro: 'Centro', cidade: 'Uberlândia', estado: 'MG',
    }));
  });

  it('mostra mensagem de CEP não encontrado', async () => {
    vi.mocked(buscarCep).mockResolvedValueOnce({ status: 'nao_encontrado' });

    render(<CepField value="00000-000" onChange={() => {}} onEnderecoEncontrado={() => {}} />);
    fireEvent.blur(screen.getByLabelText(/cep/i));

    expect(await screen.findByText(/cep não encontrado/i)).toBeInTheDocument();
  });

  it('não consulta a API quando o CEP tem menos de 8 dígitos', () => {
    render(<CepField value="123" onChange={() => {}} onEnderecoEncontrado={() => {}} />);
    fireEvent.blur(screen.getByLabelText(/cep/i));
    expect(buscarCep).not.toHaveBeenCalled();
  });
});
