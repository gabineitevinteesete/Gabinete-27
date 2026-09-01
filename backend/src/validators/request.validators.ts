import { z } from 'zod';

const booleanDeString = z.preprocess((valor) => valor === 'true' || valor === true, z.boolean());

const statusEnum = z.enum([
  'RASCUNHO',
  'ENVIADA',
  'RECEBIDA',
  'EM_CONFERENCIA',
  'PENDENTE_INFORMACAO',
  'PROTOCOLADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'ARQUIVADA',
  'RECUSADA',
]);

export const criarDemandaSchema = z.object({
  solicitanteNome: z.string().min(2),
  solicitanteTelefone: z.string().min(10),
  solicitanteNascimento: z.coerce.date().optional(),
  cep: z.string().optional(),
  rua: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  pontoReferencia: z.string().optional(),
  localExato: z.string().min(2),
  tituloResumido: z.string().min(2),
  descricao: z.string().min(2),
  descricaoOutroAssunto: z.string().optional(),
  requestTypeId: z.string().uuid(),
  autorizacaoDados: booleanDeString,
});

export const editarDemandaSchema = criarDemandaSchema.omit({ autorizacaoDados: true }).partial();

export const listarDemandasQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamanhoPagina: z.coerce.number().int().min(1).max(100).default(20),
  codigoInterno: z.string().optional(),
  solicitanteNome: z.string().optional(),
  solicitanteTelefone: z.string().optional(),
  requestTypeId: z.string().uuid().optional(),
  bairro: z.string().optional(),
  assessorResponsavelId: z.string().uuid().optional(),
  status: statusEnum.optional(),
  dataInicial: z.coerce.date().optional(),
  dataFinal: z.coerce.date().optional(),
  numeroProtocolo: z.string().optional(),
});

export const demandaIdParamsSchema = z.object({ id: z.string().uuid() });
