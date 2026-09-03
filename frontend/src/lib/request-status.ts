import type { RequestStatusValue } from '@/types/request';

export const STATUS_ANTES_DE_PROTOCOLAR: readonly RequestStatusValue[] = [
  'RASCUNHO',
  'ENVIADA',
  'RECEBIDA',
  'EM_CONFERENCIA',
  'PENDENTE_INFORMACAO',
];

// Mantenha em sincronia com backend/src/utils/request-status.ts (mesma tabela, duplicada por não haver pacote compartilhado entre backend e frontend; o backend é a fonte da verdade).
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

const STATUS_QUE_EXIGEM_MOTIVO: readonly RequestStatusValue[] = ['PENDENTE_INFORMACAO', 'RECUSADA'];

export function exigeMotivo(novoStatus: RequestStatusValue): boolean {
  return (STATUS_QUE_EXIGEM_MOTIVO as RequestStatusValue[]).includes(novoStatus);
}

export const STATUS_LABEL: Record<RequestStatusValue, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADA: 'Enviada',
  RECEBIDA: 'Recebida',
  EM_CONFERENCIA: 'Em conferência',
  PENDENTE_INFORMACAO: 'Pendente de informação',
  PROTOCOLADA: 'Protocolada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  ARQUIVADA: 'Arquivada',
  RECUSADA: 'Recusada',
};

export const ACAO_LABEL: Record<RequestStatusValue, string> = {
  RASCUNHO: '',
  ENVIADA: '',
  RECEBIDA: 'Marcar como recebida',
  EM_CONFERENCIA: 'Voltar para conferência',
  PENDENTE_INFORMACAO: 'Pedir informação',
  PROTOCOLADA: 'Protocolar',
  EM_ANDAMENTO: 'Marcar em andamento',
  CONCLUIDA: 'Concluir',
  ARQUIVADA: 'Arquivar',
  RECUSADA: 'Recusar',
};
