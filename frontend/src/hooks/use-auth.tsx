'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import type { PublicUser } from '@/types/auth';
import { apagarLista } from '@/lib/lista-demandas-offline';

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

// Resumo do usuário (sem token) para o app abrir sem internet: sem ele, a renovação da sessão
// falha por falta de rede e o usuário seria mandado para o login mesmo com a sessão válida.
const CHAVE_USUARIO_GUARDADO = 'gd:usuario';

function lerUsuarioGuardado(): PublicUser | null {
  try {
    const bruto = localStorage.getItem(CHAVE_USUARIO_GUARDADO);
    return bruto ? (JSON.parse(bruto) as PublicUser) : null;
  } catch {
    return null;
  }
}

function guardarUsuario(usuario: PublicUser): void {
  try {
    localStorage.setItem(CHAVE_USUARIO_GUARDADO, JSON.stringify(usuario));
  } catch {
    // Sem armazenamento local: só deixa de abrir offline.
  }
}

function apagarUsuarioGuardado(): void {
  try {
    localStorage.removeItem(CHAVE_USUARIO_GUARDADO);
  } catch {
    // Nada a fazer.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // O /auth/refresh só devolve o accessToken. Sem o /auth/me em seguida, `user` ficaria
        // null após um reload de página mesmo com cookie de refresh válido, e o PainelLayout
        // devolveria o usuário para /login.
        const data = await apiClient.request<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
        apiClient.setAccessToken(data.accessToken);
        const me = await apiClient.request<{ user: PublicUser }>('/auth/me', { auth: true });
        setUser(me.user);
        guardarUsuario(me.user);
      } catch (err) {
        // Erro de rede (o servidor não respondeu): segue com o usuário guardado, em modo offline.
        // Resposta de recusa do servidor (ApiError 4xx, ex.: 401) significa sessão inválida. Erro 5xx
        // (backend reiniciando) é indisponibilidade, não sessão inválida.
        const indisponivel = !(err instanceof ApiError) || err.status >= 500;
        const guardado = indisponivel ? lerUsuarioGuardado() : null;
        if (guardado) {
          setUser(guardado);
        } else {
          apiClient.setAccessToken(null);
          apagarUsuarioGuardado();
          apagarLista();
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setUsuarioAutenticado = useCallback((novoUsuario: PublicUser, accessToken: string) => {
    apiClient.setAccessToken(accessToken);
    // Quem entra começa sem a cópia da lista de quem usou o aparelho antes (ex.: sessão expirada
    // sem logout); a de quem entra é gravada de novo na primeira carga da lista.
    apagarLista();
    guardarUsuario(novoUsuario);
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
      apagarUsuarioGuardado();
      apagarLista();
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
