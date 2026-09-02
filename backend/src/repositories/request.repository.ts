import type { Prisma, PrismaClient } from '@prisma/client';
import { transicaoValida, TransicaoConcorrenteError, type RequestStatusValue } from '../utils/request-status.js';

export interface CriarRequestInput {
  codigoInterno: string;
  solicitanteNome: string;
  solicitanteTelefone: string;
  solicitanteNascimento?: Date;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  pontoReferencia?: string;
  localExato?: string;
  tituloResumido: string;
  descricao: string;
  descricaoOutroAssunto?: string;
  requestTypeId: string;
  assessorResponsavelId: string;
  autorizacaoDados: boolean;
}

export interface FotoParaSalvar {
  url: string;
  publicId: string;
  larguraPx: number;
  alturaPx: number;
  bytes: number;
}

export interface RequestSummary {
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
  createdAt: Date;
}

/**
 * Foto como está guardada no banco. `url` é a URL devolvida pelo Cloudinary no upload e fica
 * só como referência/auditoria: o que é servido à API é uma URL assinada gerada a partir do
 * `publicId` (as fotos são `type: 'authenticated'`).
 */
export interface FotoArmazenada {
  id: string;
  url: string;
  publicId: string;
  larguraPx: number | null;
  alturaPx: number | null;
}

export interface RequestDetail extends RequestSummary {
  solicitanteTelefone: string;
  solicitanteNascimento: Date | null;
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
  updatedAt: Date;
  fotos: FotoArmazenada[];
}

export interface ListarFiltro {
  codigoInterno?: string;
  solicitanteNome?: string;
  solicitanteTelefone?: string;
  requestTypeId?: string;
  bairro?: string;
  assessorResponsavelId?: string;
  status?: RequestStatusValue;
  dataInicial?: Date;
  dataFinal?: Date;
  numeroProtocolo?: string;
}

export interface Paginacao {
  pagina: number;
  tamanhoPagina: number;
}

export interface HistoricoStatusItem {
  id: string;
  statusAnterior: RequestStatusValue | null;
  statusNovo: RequestStatusValue;
  usuarioId: string;
  usuarioNome: string;
  observacao: string | null;
  createdAt: Date;
}

export type EditarRequestInput = Partial<
  Omit<CriarRequestInput, 'codigoInterno' | 'assessorResponsavelId' | 'autorizacaoDados'>
>;

export interface RequestRepository {
  create(input: CriarRequestInput, fotos: FotoParaSalvar[]): Promise<RequestDetail>;
  findById(id: string): Promise<RequestDetail | null>;
  list(filtro: ListarFiltro, paginacao: Paginacao): Promise<{ items: RequestSummary[]; total: number }>;
  update(id: string, input: EditarRequestInput): Promise<RequestDetail>;
  updateStatus(id: string, novoStatus: RequestStatusValue, usuarioId: string, motivo?: string): Promise<RequestDetail>;
  listarHistoricoStatus(id: string): Promise<HistoricoStatusItem[]>;
  reatribuir(id: string, novoAssessorId: string, reatribuidoPorId: string): Promise<RequestDetail>;
}

const INCLUDE_DETALHE = {
  fotos: { select: { id: true, url: true, publicId: true, larguraPx: true, alturaPx: true } },
  requestType: { select: { nome: true } },
  assessorResponsavel: { select: { nome: true } },
} satisfies Prisma.RequestInclude;

type RequestComRelacoes = Prisma.RequestGetPayload<{ include: typeof INCLUDE_DETALHE }>;

function toDetail(row: RequestComRelacoes): RequestDetail {
  return {
    id: row.id,
    codigoInterno: row.codigoInterno,
    tituloResumido: row.tituloResumido,
    solicitanteNome: row.solicitanteNome,
    bairro: row.bairro,
    status: row.status as RequestStatusValue,
    assessorResponsavelId: row.assessorResponsavelId,
    assessorResponsavelNome: row.assessorResponsavel.nome,
    requestTypeId: row.requestTypeId,
    requestTypeNome: row.requestType.nome,
    numeroProtocolo: row.numeroProtocolo,
    createdAt: row.createdAt,
    solicitanteTelefone: row.solicitanteTelefone,
    solicitanteNascimento: row.solicitanteNascimento,
    cep: row.cep,
    rua: row.rua,
    numero: row.numero,
    complemento: row.complemento,
    cidade: row.cidade,
    estado: row.estado,
    pontoReferencia: row.pontoReferencia,
    localExato: row.localExato,
    descricao: row.descricao,
    descricaoOutroAssunto: row.descricaoOutroAssunto,
    autorizacaoDados: row.autorizacaoDados,
    updatedAt: row.updatedAt,
    fotos: row.fotos,
  };
}

export function createRequestRepository(prisma: PrismaClient): RequestRepository {
  return {
    async create(input, fotos) {
      const criado = await prisma.request.create({
        data: {
          codigoInterno: input.codigoInterno,
          solicitanteNome: input.solicitanteNome,
          solicitanteTelefone: input.solicitanteTelefone,
          solicitanteNascimento: input.solicitanteNascimento,
          cep: input.cep,
          rua: input.rua,
          numero: input.numero,
          complemento: input.complemento,
          bairro: input.bairro,
          cidade: input.cidade,
          estado: input.estado,
          pontoReferencia: input.pontoReferencia,
          localExato: input.localExato,
          tituloResumido: input.tituloResumido,
          descricao: input.descricao,
          descricaoOutroAssunto: input.descricaoOutroAssunto,
          requestTypeId: input.requestTypeId,
          assessorResponsavelId: input.assessorResponsavelId,
          autorizacaoDados: input.autorizacaoDados,
          status: 'ENVIADA',
          fotos: {
            create: fotos.map((f) => ({
              url: f.url,
              publicId: f.publicId,
              larguraPx: f.larguraPx,
              alturaPx: f.alturaPx,
              bytes: f.bytes,
            })),
          },
        },
        include: INCLUDE_DETALHE,
      });
      return toDetail(criado);
    },

    async findById(id) {
      const encontrado = await prisma.request.findUnique({
        where: { id },
        include: INCLUDE_DETALHE,
      });
      return encontrado ? toDetail(encontrado) : null;
    },

    async list(filtro, paginacao) {
      const where: Prisma.RequestWhereInput = {
        ...(filtro.codigoInterno ? { codigoInterno: { contains: filtro.codigoInterno, mode: 'insensitive' } } : {}),
        ...(filtro.solicitanteNome ? { solicitanteNome: { contains: filtro.solicitanteNome, mode: 'insensitive' } } : {}),
        ...(filtro.solicitanteTelefone ? { solicitanteTelefone: filtro.solicitanteTelefone } : {}),
        ...(filtro.requestTypeId ? { requestTypeId: filtro.requestTypeId } : {}),
        ...(filtro.bairro ? { bairro: { contains: filtro.bairro, mode: 'insensitive' } } : {}),
        ...(filtro.assessorResponsavelId ? { assessorResponsavelId: filtro.assessorResponsavelId } : {}),
        ...(filtro.status ? { status: filtro.status } : {}),
        ...(filtro.numeroProtocolo ? { numeroProtocolo: filtro.numeroProtocolo } : {}),
        ...(filtro.dataInicial || filtro.dataFinal
          ? {
              createdAt: {
                ...(filtro.dataInicial ? { gte: filtro.dataInicial } : {}),
                ...(filtro.dataFinal ? { lte: filtro.dataFinal } : {}),
              },
            }
          : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.request.findMany({
          where,
          include: INCLUDE_DETALHE,
          orderBy: { createdAt: 'desc' },
          skip: (paginacao.pagina - 1) * paginacao.tamanhoPagina,
          take: paginacao.tamanhoPagina,
        }),
        prisma.request.count({ where }),
      ]);

      const items: RequestSummary[] = rows.map((row) => {
        const detalhe = toDetail(row);
        const {
          solicitanteTelefone: _t,
          solicitanteNascimento: _n,
          cep: _c,
          rua: _r,
          numero: _nu,
          complemento: _co,
          cidade: _ci,
          estado: _e,
          pontoReferencia: _p,
          localExato: _l,
          descricao: _d,
          descricaoOutroAssunto: _do,
          autorizacaoDados: _a,
          updatedAt: _u,
          fotos: _f,
          ...resumo
        } = detalhe;
        return resumo;
      });

      return { items, total };
    },

    async update(id, input) {
      const atualizado = await prisma.request.update({
        where: { id },
        data: {
          ...(input.solicitanteNome !== undefined ? { solicitanteNome: input.solicitanteNome } : {}),
          ...(input.solicitanteTelefone !== undefined ? { solicitanteTelefone: input.solicitanteTelefone } : {}),
          ...(input.solicitanteNascimento !== undefined ? { solicitanteNascimento: input.solicitanteNascimento } : {}),
          ...(input.cep !== undefined ? { cep: input.cep } : {}),
          ...(input.rua !== undefined ? { rua: input.rua } : {}),
          ...(input.numero !== undefined ? { numero: input.numero } : {}),
          ...(input.complemento !== undefined ? { complemento: input.complemento } : {}),
          ...(input.bairro !== undefined ? { bairro: input.bairro } : {}),
          ...(input.cidade !== undefined ? { cidade: input.cidade } : {}),
          ...(input.estado !== undefined ? { estado: input.estado } : {}),
          ...(input.pontoReferencia !== undefined ? { pontoReferencia: input.pontoReferencia } : {}),
          ...(input.localExato !== undefined ? { localExato: input.localExato } : {}),
          ...(input.tituloResumido !== undefined ? { tituloResumido: input.tituloResumido } : {}),
          ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
          ...(input.descricaoOutroAssunto !== undefined ? { descricaoOutroAssunto: input.descricaoOutroAssunto } : {}),
          ...(input.requestTypeId !== undefined ? { requestTypeId: input.requestTypeId } : {}),
        },
        include: INCLUDE_DETALHE,
      });
      return toDetail(atualizado);
    },

    async updateStatus(id, novoStatus, usuarioId, motivo) {
      return prisma.$transaction(async (tx) => {
        const atual = await tx.request.findUniqueOrThrow({ where: { id } });
        // Revalida contra a leitura fresca dentro da transação: o service validou fora dela e
        // uma requisição concorrente pode ter mudado o status nesse meio-tempo (o histórico
        // ficaria com duas linhas alegando a mesma origem).
        if (!transicaoValida(atual.status as RequestStatusValue, novoStatus)) {
          throw new TransicaoConcorrenteError();
        }
        await tx.requestStatusHistory.create({
          data: {
            requestId: id,
            statusAnterior: atual.status,
            statusNovo: novoStatus,
            usuarioId,
            observacao: motivo,
          },
        });
        const atualizado = await tx.request.update({
          where: { id },
          data: {
            status: novoStatus,
            ...(novoStatus === 'ARQUIVADA' ? { arquivadoEm: new Date() } : {}),
          },
          include: INCLUDE_DETALHE,
        });
        return toDetail(atualizado);
      });
    },

    async listarHistoricoStatus(id) {
      const rows = await prisma.requestStatusHistory.findMany({
        where: { requestId: id },
        include: { usuario: { select: { nome: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((row) => ({
        id: row.id,
        statusAnterior: row.statusAnterior as RequestStatusValue | null,
        statusNovo: row.statusNovo as RequestStatusValue,
        usuarioId: row.usuarioId,
        usuarioNome: row.usuario.nome,
        observacao: row.observacao,
        createdAt: row.createdAt,
      }));
    },

    async reatribuir(id, novoAssessorId, reatribuidoPorId) {
      return prisma.$transaction(async (tx) => {
        const atual = await tx.request.findUniqueOrThrow({ where: { id } });
        await tx.requestReassignmentHistory.create({
          data: {
            requestId: id,
            assessorAnteriorId: atual.assessorResponsavelId,
            assessorNovoId: novoAssessorId,
            reatribuidoPorId,
          },
        });
        const atualizado = await tx.request.update({
          where: { id },
          data: { assessorResponsavelId: novoAssessorId },
          include: INCLUDE_DETALHE,
        });
        return toDetail(atualizado);
      });
    },
  };
}
