export type UserRoleValue = 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE';

export interface PublicUser {
  id: string;
  nome: string;
  telefone: string;
  role: UserRoleValue;
  ativo: boolean;
  pinDefinido: boolean;
}
