'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/services/api-client';
import { tempoRelativo } from '@/lib/tempo-relativo';

interface Notificacao {
  id: string;
  requestId: string | null;
  tipo: string;
  mensagem: string;
  lida: boolean;
  createdAt: string;
}

interface RespostaNotificacoes {
  items: Notificacao[];
  naoLidas: number;
}

const INTERVALO_MS = 60_000;

/** Sino do topo do painel: contador de avisos não lidos e a lista dos mais recentes. */
export function SinoNotificacoes() {
  const router = useRouter();
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botaoSino = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  // Sobe a cada busca nova e a cada marcação feita na tela: uma resposta que começou antes disso
  // está velha e é descartada (senão desfaria a marcação ou se sobreporia a uma busca mais nova).
  const versao = useRef(0);

  const carregar = useCallback(async () => {
    versao.current += 1;
    const minhaVersao = versao.current;
    try {
      const dados = await apiClient.request<RespostaNotificacoes>('/notificacoes', { auth: true });
      if (minhaVersao !== versao.current) return;
      setItens(dados.items);
      setNaoLidas(dados.naoLidas);
    } catch {
      // Sem rede ou servidor fora do ar: mantém o que já estava na tela e tenta de novo depois.
    }
  }, []);

  useEffect(() => {
    void carregar();
    // Só com a aba visível: uma aba esquecida em segundo plano não fica renovando a sessão para sempre.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void carregar();
    }, INTERVALO_MS);
    const aoVoltar = () => void carregar();
    const aoFicarVisivel = () => {
      if (document.visibilityState === 'visible') void carregar();
    };
    window.addEventListener('online', aoVoltar);
    document.addEventListener('visibilitychange', aoFicarVisivel);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', aoVoltar);
      document.removeEventListener('visibilitychange', aoFicarVisivel);
    };
  }, [carregar]);

  useEffect(() => {
    if (aberto) painel.current?.focus();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (evento: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) setAberto(false);
    };
    const aoApertarEsc = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setAberto(false);
        botaoSino.current?.focus();
      }
    };
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoApertarEsc);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoApertarEsc);
    };
  }, [aberto]);

  function abrirAviso(aviso: Notificacao) {
    setAberto(false);
    if (!aviso.lida) {
      versao.current += 1;
      setItens((atual) => atual.map((item) => (item.id === aviso.id ? { ...item, lida: true } : item)));
      setNaoLidas((atual) => Math.max(0, atual - 1));
      apiClient.request(`/notificacoes/${aviso.id}/lida`, { method: 'PATCH', auth: true }).catch(() => void carregar());
    }
    if (aviso.requestId) router.push(`/painel/demandas/${aviso.requestId}`);
  }

  function marcarTodas() {
    versao.current += 1;
    setItens((atual) => atual.map((item) => ({ ...item, lida: true })));
    setNaoLidas(0);
    apiClient.request('/notificacoes/lidas', { method: 'PATCH', auth: true }).catch(() => void carregar());
  }

  const contador = naoLidas > 9 ? '9+' : String(naoLidas);

  return (
    <div ref={raiz} className="relative">
      <button
        ref={botaoSino}
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-controls="painel-avisos"
        aria-label={naoLidas > 0 ? `Avisos (${naoLidas} não lidos)` : 'Avisos'}
        aria-expanded={aberto}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-primary-dark shadow-sm"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {naoLidas > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white"
          >
            {contador}
          </span>
        )}
      </button>

      {aberto && (
        <div
          ref={painel}
          id="painel-avisos"
          tabIndex={-1}
          role="dialog"
          aria-label="Lista de avisos"
          className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card bg-white p-2 shadow-lg outline-none"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-semibold text-primary-dark">Avisos</p>
            {naoLidas > 0 && (
              <button type="button" onClick={marcarTodas} className="text-xs font-medium text-primary-dark hover:underline">
                Marcar todas como lidas
              </button>
            )}
          </div>

          {itens.length === 0 ? (
            <p className="px-2 py-4 text-sm text-gray-500">Nenhum aviso por enquanto.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {itens.map((aviso) => (
                <li key={aviso.id}>
                  <button
                    type="button"
                    onClick={() => abrirAviso(aviso)}
                    className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left hover:bg-primary-light"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${aviso.lida ? 'bg-transparent' : 'bg-secondary'}`}
                    />
                    <span className="flex flex-col">
                      <span className={`text-sm ${aviso.lida ? 'text-gray-600' : 'font-medium text-gray-900'}`}>
                        {!aviso.lida && <span className="sr-only">Não lido. </span>}
                        {aviso.mensagem}
                      </span>
                      <span className="text-xs text-gray-500">{tempoRelativo(aviso.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
