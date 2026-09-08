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

export interface TipoDemanda {
  id: string;
  nome: string;
  exigeDescricaoObrigatoria: boolean;
}

export interface DemandaResumo {
  id: string;
  codigoInterno: string;
  tituloResumido: string;
  solicitanteNome: string;
  bairro: string | null;
  status: RequestStatusValue;
  assessorResponsavelId: string;
  assessorResponsavelNome: string;
  requestTypeId: string;
  requestTypeNome: string;
  numeroProtocolo: string | null;
  createdAt: string;
}

export interface DemandaDetalhe extends DemandaResumo {
  solicitanteTelefone: string;
  solicitanteNascimento: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  pontoReferencia: string | null;
  localExato: string | null;
  descricao: string;
  descricaoOutroAssunto: string | null;
  autorizacaoDados: boolean;
  updatedAt: string;
  fotos: { id: string; url: string; larguraPx: number | null; alturaPx: number | null }[];
}

export interface HistoricoStatusItem {
  id: string;
  statusAnterior: RequestStatusValue | null;
  statusNovo: RequestStatusValue;
  usuarioId: string;
  usuarioNome: string;
  observacao: string | null;
  createdAt: string;
}

export interface ObservacaoInterna {
  id: string;
  requestId: string;
  autorId: string;
  autorNome: string;
  texto: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface ContagemStatus {
  status: RequestStatusValue;
  quantidade: number;
}

export interface ContagemBairro {
  bairro: string;
  quantidade: number;
}

export interface ContagemAssessor {
  assessorId: string;
  assessorNome: string;
  quantidade: number;
}

export interface DemandaParada {
  id: string;
  codigoInterno: string;
  tituloResumido: string;
  assessorResponsavelNome: string;
  status: RequestStatusValue;
  diasParada: number;
}

export interface ResumoDashboard {
  porStatus: ContagemStatus[];
  porBairro: ContagemBairro[];
  porAssessor: ContagemAssessor[];
  paradas: DemandaParada[];
}

export interface ProdutividadeAssessor {
  assessorId: string;
  assessorNome: string;
  porStatus: Record<RequestStatusValue, number>;
  total: number;
}
