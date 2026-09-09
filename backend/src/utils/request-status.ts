export type RequestStatusValue =
  | 'RASCUNHO'
  | 'ENVIADA'
  | 'RECEBIDA'
  | 'EM_CONFERENCIA'
  | 'PENDENTE_INFORMACAO'
  | 'PROTOCOLADA'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'ARQUIVADA'
  | 'RECUSADA';

export const STATUS_ANTES_DE_PROTOCOLAR: readonly RequestStatusValue[] = [
  'RASCUNHO',
  'ENVIADA',
  'RECEBIDA',
  'EM_CONFERENCIA',
  'PENDENTE_INFORMACAO',
];

export function podeEditarComoAssessorDeRua(status: RequestStatusValue): boolean {
  return (STATUS_ANTES_DE_PROTOCOLAR as RequestStatusValue[]).includes(status);
}

// Mantenha em sincronia com frontend/src/lib/request-status.ts (mesma tabela, duplicada por não haver pacote compartilhado entre backend e frontend).
export const TRANSICOES_VALIDAS: Record<RequestStatusValue, RequestStatusValue[]> = {
  RASCUNHO: [],
  ENVIADA: ['RECEBIDA', 'RECUSADA'],
  RECEBIDA: ['EM_CONFERENCIA', 'RECUSADA'],
  EM_CONFERENCIA: ['PENDENTE_INFORMACAO', 'PROTOCOLADA', 'RECUSADA'],
  PENDENTE_INFORMACAO: ['EM_CONFERENCIA', 'RECUSADA'],
  PROTOCOLADA: ['EM_ANDAMENTO'],
  EM_ANDAMENTO: ['CONCLUIDA'],
  CONCLUIDA: ['ARQUIVADA'],
  ARQUIVADA: [],
  RECUSADA: ['ARQUIVADA'],
};

export function transicaoValida(de: RequestStatusValue, para: RequestStatusValue): boolean {
  return TRANSICOES_VALIDAS[de].includes(para);
}

const STATUS_QUE_EXIGEM_MOTIVO: readonly RequestStatusValue[] = ['PENDENTE_INFORMACAO', 'RECUSADA'];

export function exigeMotivo(novoStatus: RequestStatusValue): boolean {
  return (STATUS_QUE_EXIGEM_MOTIVO as RequestStatusValue[]).includes(novoStatus);
}

/**
 * A transição já era válida quando o service checou, mas outra requisição concorrente mudou o
 * status antes desta gravar. Lançada pela revalidação feita dentro da transação do repositório.
 */
export class TransicaoConcorrenteError extends Error {
  constructor() {
    super('Transição de status inválida para o status atual da demanda');
    this.name = 'TransicaoConcorrenteError';
  }
}
