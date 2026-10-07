/**
 * Fila de demandas criadas sem internet, guardada no IndexedDB do aparelho até o envio.
 * Cada item pertence a um usuário: só ele o vê e o envia (ver `listarPendentes`).
 */
export interface DemandaPendente {
  id: string;
  usuarioId: string;
  criadoEm: number;
  /** Campos de texto exatamente como a tela de nova demanda os envia no FormData. */
  campos: Record<string, string>;
  /** Fotos já comprimidas, na ordem em que foram escolhidas. */
  fotos: Blob[];
  tentativas: number;
  /** Mensagem do servidor quando ele recusou a demanda; `null` enquanto só aguarda sinal. */
  ultimoErro: string | null;
}

export const EVENTO_FILA_MUDOU = 'gd:fila-mudou';

let canal: BroadcastChannel | null = null;

// Canal entre abas/janelas do mesmo aparelho: o evento da janela só alcança a própria aba.
function obterCanal(): BroadcastChannel | null {
  if (canal || typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return canal;
  canal = new BroadcastChannel('gd-fila');
  canal.onmessage = () => window.dispatchEvent(new Event(EVENTO_FILA_MUDOU));
  return canal;
}

// Avisa as telas abertas (barra de pendentes, página de pendentes), nesta e nas outras abas, de
// que a fila mudou.
function notificarMudanca(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENTO_FILA_MUDOU));
  obterCanal()?.postMessage('mudou');
}

/** Garante que esta aba também escuta as mudanças feitas pelas outras. */
export function escutarOutrasAbas(): void {
  obterCanal();
}

const NOME_BANCO = 'gabinete-digital';
const NOME_STORE = 'demandas-pendentes';

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const abertura = indexedDB.open(NOME_BANCO, 1);
    abertura.onupgradeneeded = () => {
      abertura.result.createObjectStore(NOME_STORE, { keyPath: 'id' });
    };
    abertura.onsuccess = () => resolve(abertura.result);
    abertura.onerror = () => reject(abertura.error);
  });
}

function aguardar<T>(pedido: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

async function comStore<T>(modo: IDBTransactionMode, operacao: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const banco = await abrirBanco();
  try {
    const transacao = banco.transaction(NOME_STORE, modo);
    const resultado = await aguardar(operacao(transacao.objectStore(NOME_STORE)));
    await new Promise<void>((resolve, reject) => {
      transacao.oncomplete = () => resolve();
      transacao.onerror = () => reject(transacao.error);
      transacao.onabort = () => reject(transacao.error);
      // Em transações só de leitura o `complete` pode já ter disparado.
      if (modo === 'readonly') resolve();
    });
    return resultado;
  } finally {
    banco.close();
  }
}

function gerarId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function adicionarPendente(entrada: {
  usuarioId: string;
  campos: Record<string, string>;
  fotos: Blob[];
}): Promise<DemandaPendente> {
  const pendente: DemandaPendente = {
    id: gerarId(),
    usuarioId: entrada.usuarioId,
    criadoEm: Date.now(),
    campos: entrada.campos,
    fotos: entrada.fotos,
    tentativas: 0,
    ultimoErro: null,
  };
  await comStore('readwrite', (store) => store.add(pendente));
  notificarMudanca();
  return pendente;
}

export async function listarPendentes(usuarioId: string): Promise<DemandaPendente[]> {
  const todos = await comStore<DemandaPendente[]>('readonly', (store) => store.getAll());
  return todos.filter((item) => item.usuarioId === usuarioId).sort((a, b) => a.criadoEm - b.criadoEm);
}

export async function removerPendente(id: string): Promise<void> {
  await comStore('readwrite', (store) => store.delete(id));
  notificarMudanca();
}

async function atualizar(id: string, mudar: (item: DemandaPendente) => DemandaPendente): Promise<void> {
  const banco = await abrirBanco();
  try {
    await new Promise<void>((resolve, reject) => {
      const transacao = banco.transaction(NOME_STORE, 'readwrite');
      const store = transacao.objectStore(NOME_STORE);
      const leitura = store.get(id);
      leitura.onsuccess = () => {
        const atual = leitura.result as DemandaPendente | undefined;
        if (atual) store.put(mudar(atual));
      };
      transacao.oncomplete = () => resolve();
      transacao.onerror = () => reject(transacao.error);
      transacao.onabort = () => reject(transacao.error);
    });
  } finally {
    banco.close();
  }
  notificarMudanca();
}

export function marcarErro(id: string, mensagem: string): Promise<void> {
  return atualizar(id, (item) => ({ ...item, tentativas: item.tentativas + 1, ultimoErro: mensagem }));
}

export function limparErro(id: string): Promise<void> {
  return atualizar(id, (item) => ({ ...item, ultimoErro: null }));
}
