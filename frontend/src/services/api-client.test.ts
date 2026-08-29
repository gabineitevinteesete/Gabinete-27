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

  it('lança ApiError com a mensagem do backend quando a resposta falha', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: 'Dados inválidos' }),
    });

    await expect(apiClient.request('/usuarios', { method: 'POST', body: {} })).rejects.toThrow(ApiError);
  });
});
