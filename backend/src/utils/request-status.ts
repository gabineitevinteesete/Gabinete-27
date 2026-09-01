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
