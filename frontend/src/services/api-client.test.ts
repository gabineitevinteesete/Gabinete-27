import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from './api-client';

describe('apiClient.request', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    apiClient.setAccessToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('faz a requisição com o access token quando auth=true', async () => {
    apiClient.setAccessToken('token-abc');
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ok: true } }),
    });

    const data = await apiClient.request('/usuarios', { auth: true });

    expect(data).toEqual({ ok: true });
    const [, init] = (fetch as any).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer token-abc');
    expect(init.credentials).toBe('include');
  });

  it('tenta renovar o access token uma vez após 401 e repete a chamada', async () => {
    apiClient.setAccessToken('token-expirado');
    (fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ success: false, error: 'expirado' }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { accessToken: 'token-novo' } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { ok: true } }) });

    const data = await apiClient.request('/usuarios', { auth: true });

    expect(data).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    const [, initFinal] = (fetch as any).mock.calls[2];
    expect(initFinal.headers.Authorization).toBe('Bearer token-novo');
  });

  it('resposta de erro que não é JSON vira ApiError com o status, não um erro de rede', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });

    await expect(apiClient.request('/demandas', { auth: false })).rejects.toMatchObject({
      status: 502,
      message: 'Erro inesperado',
    });
  });

  it('envia os cabeçalhos extras (ex.: Idempotency-Key) junto dos de sempre', async () => {
    apiClient.setAccessToken('token-abc');
    (fetch as any).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: {} }) });

    await apiClient.request('/demandas', { method: 'POST', body: new FormData(), auth: true, headers: { 'Idempotency-Key': 'chave-1' } });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.headers['Idempotency-Key']).toBe('chave-1');
    expect(init.headers.Authorization).toBe('Bearer token-abc');
  });

  // O POST /auth/logout responde 204 sem corpo: chamar res.json() ali lançava.
  it('não tenta parsear corpo em respostas 204', async () => {
    const json = vi.fn(async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    });
    (fetch as any).mockResolvedValueOnce({ ok: true, status: 204, json });

    await expect(apiClient.request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('lança ApiError com a mensagem do backend quando a resposta falha', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: 'Dados inválidos' }),
    });

    await expect(apiClient.request('/usuarios', { method: 'POST', body: {} })).rejects.toThrow(ApiError);
  });

  it('envia FormData sem JSON.stringify e sem forçar Content-Type', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: { ok: true } }),
    });

    const formData = new FormData();
    formData.append('campo', 'valor');

    await apiClient.request('/demandas', { method: 'POST', body: formData, auth: true });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.body).toBe(formData);
    expect(init.headers['Content-Type']).toBeUndefined();
  });
});

describe('apiClient.requestBlob', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    apiClient.setAccessToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devolve o blob da resposta, enviando o access token', async () => {
    apiClient.setAccessToken('token-abc');
    const blob = new Blob(['a;b']);
    (fetch as any).mockResolvedValueOnce({ ok: true, status: 200, blob: async () => blob });

    const resultado = await apiClient.requestBlob('/demandas/exportar', { auth: true });

    expect(resultado).toBe(blob);
    const [, init] = (fetch as any).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer token-abc');
    expect(init.credentials).toBe('include');
  });

  it('renova o token uma vez após 401 e repete a chamada', async () => {
    apiClient.setAccessToken('token-expirado');
    const blob = new Blob(['a;b']);
    (fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'expirado' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { accessToken: 'token-novo' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, blob: async () => blob });

    const resultado = await apiClient.requestBlob('/demandas/exportar', { auth: true });

    expect(resultado).toBe(blob);
    expect(fetch).toHaveBeenCalledTimes(3);
    const [, initFinal] = (fetch as any).mock.calls[2];
    expect(initFinal.headers.Authorization).toBe('Bearer token-novo');
  });

  it('lança ApiError com a mensagem do backend quando a resposta não é ok', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: 'Muitos resultados' }),
    });

    await expect(apiClient.requestBlob('/demandas/exportar', { auth: true })).rejects.toMatchObject({
      status: 400,
      message: 'Muitos resultados',
    });
  });
});
