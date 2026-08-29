'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import type { PublicUser } from '@/types/auth';

export type { UserRoleValue, PublicUser } from '@/types/auth';

export type LoginOutcome =
  | { status: 'ok' }
  | { status: 'primeiro_acesso'; userId: string }
  | { status: 'erro'; mensagem: string };

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  login(telefone: string, pin: string): Promise<LoginOutcome>;
  logout(): Promise<void>;
  setUsuarioAutenticado(user: PublicUser, accessToken: string): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.request<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
        apiClient.setAccessToken(data.accessToken);
      } catch {
        apiClient.setAccessToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setUsuarioAutenticado = useCallback((novoUsuario: PublicUser, accessToken: string) => {
    apiClient.setAccessToken(accessToken);
    setUser(novoUsuario);
  }, []);

  const login = useCallback(async (telefone: string, pin: string): Promise<LoginOutcome> => {
    try {
      const data = await apiClient.request<{
        status: 'ok' | 'primeiro_acesso';
        accessToken?: string;
        user?: PublicUser;
        userId?: string;
      }>('/auth/login', { method: 'POST', body: { telefone, pin } });

      if (data.status === 'primeiro_acesso' && data.userId) {
        return { status: 'primeiro_acesso', userId: data.userId };
      }
      if (data.status === 'ok' && data.accessToken && data.user) {
        setUsuarioAutenticado(data.user, data.accessToken);
        return { status: 'ok' };
      }
      return { status: 'erro', mensagem: 'Resposta inesperada do servidor' };
    } catch (err) {
      if (err instanceof ApiError) {
        return { status: 'erro', mensagem: err.message };
      }
      return { status: 'erro', mensagem: 'Não foi possível conectar ao servidor' };
    }
  }, [setUsuarioAutenticado]);

  const logout = useCallback(async () => {
    try {
      await apiClient.request('/auth/logout', { method: 'POST', auth: true });
    } finally {
      apiClient.setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUsuarioAutenticado }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
