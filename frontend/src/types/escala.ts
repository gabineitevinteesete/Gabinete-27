export type LocalEscalaValue = 'GABINETE' | 'RUA';

export interface AtribuicaoEscala {
  userId: string;
  userNome: string;
  local: LocalEscalaValue;
}
