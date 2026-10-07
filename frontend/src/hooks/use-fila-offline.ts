'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  EVENTO_FILA_MUDOU,
  escutarOutrasAbas,
  limparErro,
  listarPendentes,
  removerPendente,
  type DemandaPendente,
} from '@/lib/fila-offline';
import { sincronizarFila } from '@/lib/sincronizar-fila';

const INTERVALO_SINCRONIZACAO_MS = 30_000;

/**
 * Demandas criadas sem internet que ainda não foram enviadas, do usuário logado. Tenta enviar
 * ao montar, quando o aparelho volta a ter rede (evento `online`) e a cada 30 segundos enquanto
 * houver pendentes aguardando.
 */
export function useFilaOffline() {
  const { user, logout } = useAuth();
  const usuarioId = user?.id ?? null;
  const [pendentes, setPendentes] = useState<DemandaPendente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  const recarregar = useCallback(async () => {
    if (!usuarioId) {
      setPendentes([]);
      return;
    }
    try {
      setPendentes(await listarPendentes(usuarioId));
    } catch {
      // Sem IndexedDB (navegador antigo, modo restrito): sem fila, sem pendentes.
      setPendentes([]);
    }
  }, [usuarioId]);

  const sincronizarAgora = useCallback(async () => {
    if (!usuarioId) return;
    setSincronizando(true);
    try {
      const resultado = await sincronizarFila(usuarioId);
      // Sessão vencida: sem entrar de novo os envios nunca vão passar. As demandas continuam
      // guardadas no aparelho e saem depois do próximo login.
      if (resultado?.sessaoExpirada) await logout();
    } catch {
      // A fila continua guardada; a próxima rodada tenta de novo.
    } finally {
      setSincronizando(false);
      await recarregar();
    }
  }, [usuarioId, recarregar, logout]);

  useEffect(() => {
    escutarOutrasAbas();
    void recarregar();
    if (usuarioId && navigator.onLine !== false) void sincronizarAgora();
  }, [usuarioId, recarregar, sincronizarAgora]);

  useEffect(() => {
    const aoMudar = () => void recarregar();
    const aoVoltarOnline = () => void sincronizarAgora();
    window.addEventListener(EVENTO_FILA_MUDOU, aoMudar);
    window.addEventListener('online', aoVoltarOnline);
    return () => {
      window.removeEventListener(EVENTO_FILA_MUDOU, aoMudar);
      window.removeEventListener('online', aoVoltarOnline);
    };
  }, [recarregar, sincronizarAgora]);

  const temAguardando = pendentes.some((item) => item.ultimoErro === null);
  useEffect(() => {
    if (!temAguardando) return;
    const timer = setInterval(() => void sincronizarAgora(), INTERVALO_SINCRONIZACAO_MS);
    return () => clearInterval(timer);
  }, [temAguardando, sincronizarAgora]);

  const descartar = useCallback(async (id: string) => {
    await removerPendente(id);
  }, []);

  const tentarDeNovo = useCallback(
    async (id: string) => {
      await limparErro(id);
      await sincronizarAgora();
    },
    [sincronizarAgora],
  );

  return { pendentes, sincronizando, sincronizarAgora, descartar, tentarDeNovo };
}
