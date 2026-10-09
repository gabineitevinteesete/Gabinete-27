import type { DemandaResumo } from '@/types/request';

/**
 * Cópia da primeira página da lista de demandas (sem filtros) para a tela abrir sem internet.
 * Só traz os campos que a lista já mostra: nada de telefone, endereço, descrição ou fotos.
 */
const CHAVE_LISTA = 'gd:lista-demandas';

// Passado este prazo a cópia deixa de ser usada (e some do aparelho): evita dado velho para sempre.
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ListaGuardada {
  usuarioId: string;
  salvaEm: number;
  items: DemandaResumo[];
  total: number;
}

// Copia só os campos da lista, mesmo que a resposta da API um dia traga mais do que isso.
function resumir(d: DemandaResumo): DemandaResumo {
  return {
    id: d.id,
    codigoInterno: d.codigoInterno,
    tituloResumido: d.tituloResumido,
    solicitanteNome: d.solicitanteNome,
    bairro: d.bairro,
    status: d.status,
    assessorResponsavelId: d.assessorResponsavelId,
    assessorResponsavelNome: d.assessorResponsavelNome,
    requestTypeId: d.requestTypeId,
    requestTypeNome: d.requestTypeNome,
    numeroProtocolo: d.numeroProtocolo,
    createdAt: d.createdAt,
  };
}

export function guardarLista(usuarioId: string, lista: { items: DemandaResumo[]; total: number }): void {
  try {
    const guardada: ListaGuardada = {
      usuarioId,
      salvaEm: Date.now(),
      items: lista.items.map(resumir),
      total: lista.total,
    };
    localStorage.setItem(CHAVE_LISTA, JSON.stringify(guardada));
  } catch {
    // Sem armazenamento local: a lista só deixa de abrir offline.
  }
}

/** Devolve a cópia só se for do mesmo usuário; outro usuário no aparelho não a enxerga. */
export function lerLista(usuarioId: string): ListaGuardada | null {
  try {
    const bruto = localStorage.getItem(CHAVE_LISTA);
    if (!bruto) return null;
    const guardada = JSON.parse(bruto) as ListaGuardada;
    const valida =
      Array.isArray(guardada.items) && Number.isFinite(guardada.salvaEm) && Number.isFinite(guardada.total);
    if (!valida || guardada.usuarioId !== usuarioId) return null;
    if (Date.now() - guardada.salvaEm > VALIDADE_MS) {
      apagarLista();
      return null;
    }
    return guardada;
  } catch {
    return null;
  }
}

export function apagarLista(): void {
  try {
    localStorage.removeItem(CHAVE_LISTA);
  } catch {
    // Nada a fazer.
  }
}
