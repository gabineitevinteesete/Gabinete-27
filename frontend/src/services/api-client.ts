const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) return false;
  const body = await res.json();
  accessToken = body.data.accessToken;
  return true;
}

async function rawRequest(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, init);
}

// Executa a chamada e, se o access token expirou (401), renova uma vez e repete.
async function fetchComRenovacao(path: string, buildInit: () => RequestInit, auth?: boolean): Promise<Response> {
  let res = await rawRequest(path, buildInit());

  if (res.status === 401 && auth) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const renovado = await refreshPromise;
    if (renovado) {
      res = await rawRequest(path, buildInit());
    }
  }
  return res;
}

export const apiClient = {
  setAccessToken(token: string | null) {
    accessToken = token;
  },
  getAccessToken(): string | null {
    return accessToken;
  },
  async request<T>(
    path: string,
    options: { method?: string; body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const ehFormData = options.body instanceof FormData;

    const buildInit = (): RequestInit => ({
      method: options.method ?? 'GET',
      headers: {
        ...(ehFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include',
      body: ehFormData ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const res = await fetchComRenovacao(path, buildInit, options.auth);

    // 204 não tem corpo — chamar res.json() aqui lança (é o caso do POST /auth/logout).
    if (res.status === 204) {
      return undefined as T;
    }

    const body = await res.json();
    if (!res.ok) {
      throw new ApiError(res.status, body.error ?? 'Erro inesperado');
    }
    return body.data as T;
  },
  // Para respostas que não são JSON (ex.: arquivo CSV). Erros continuam vindo como JSON.
  async requestBlob(path: string, options: { auth?: boolean } = {}): Promise<Blob> {
    const buildInit = (): RequestInit => ({
      method: 'GET',
      headers: options.auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      credentials: 'include',
    });

    const res = await fetchComRenovacao(path, buildInit, options.auth);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error ?? 'Erro inesperado');
    }
    return res.blob();
  },
};
