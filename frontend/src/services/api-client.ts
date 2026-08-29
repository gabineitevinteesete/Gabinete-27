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
    const buildInit = (): RequestInit => ({
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    let res = await rawRequest(path, buildInit());

    if (res.status === 401 && options.auth) {
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const renovado = await refreshPromise;
      if (renovado) {
        res = await rawRequest(path, buildInit());
      }
    }

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
};
