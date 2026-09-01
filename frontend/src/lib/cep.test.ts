import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buscarCep } from './cep';

describe('buscarCep', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna o endereço quando o ViaCEP encontra o CEP', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logradouro: 'Rua das Palmeiras', bairro: 'Centro', localidade: 'Uberlândia', uf: 'MG' }),
    });

    const resultado = await buscarCep('38400-000');

    expect(resultado).toEqual({
      status: 'ok',
      endereco: { rua: 'Rua das Palmeiras', bairro: 'Centro', cidade: 'Uberlândia', estado: 'MG' },
    });
    expect(fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/38400000/json/');
  });

  it('retorna nao_encontrado quando o ViaCEP responde com erro:true', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ erro: true }) });
    const resultado = await buscarCep('00000000');
    expect(resultado).toEqual({ status: 'nao_encontrado' });
  });

  it('retorna erro para um CEP com formato inválido, sem chamar a rede', async () => {
    const resultado = await buscarCep('123');
    expect(resultado).toEqual({ status: 'erro' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retorna erro quando a requisição falha', async () => {
    (fetch as any).mockRejectedValueOnce(new Error('rede fora do ar'));
    const resultado = await buscarCep('38400-000');
    expect(resultado).toEqual({ status: 'erro' });
  });
});
