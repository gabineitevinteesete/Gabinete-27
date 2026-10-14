import type { PrismaClient } from '@prisma/client';
import type { RequestStatusValue } from '../utils/request-status.js';
import type { UserRoleValue } from '../utils/jwt.js';

const STATUS_FINALIZADOS: readonly RequestStatusValue[] = ['CONCLUIDA', 'ARQUIVADA', 'RECUSADA'];
const TODOS_STATUS: readonly RequestStatusValue[] = [
  'RASCUNHO', 'ENVIADA', 'RECEBIDA', 'EM_CONFERENCIA', 'PENDENTE_INFORMACAO',
  'PROTOCOLADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'ARQUIVADA', 'RECUSADA',
];
const DIAS_PARA_CONSIDERAR_PARADA = 2;

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

export interface ContagemTipo {
  tipo: string;
  quantidade: number;
}

export interface RelatorioPeriodo {
  total: number;
  porStatus: ContagemStatus[];
  porTipo: ContagemTipo[];
  porBairro: ContagemBairro[];
  porAssessor: ContagemAssessor[];
}

export interface DashboardRepository {
  resumo(): Promise<ResumoDashboard>;
  /** Demandas criadas em [inicio, fimExclusivo), contadas pelo status e pelo responsável de hoje. */
  relatorioPeriodo(inicio: Date, fimExclusivo: Date): Promise<RelatorioPeriodo>;
  produtividadeAssessores(mesInicio: Date, mesFim: Date): Promise<ProdutividadeAssessor[]>;
}

export function createDashboardRepository(prisma: PrismaClient): DashboardRepository {
  return {
    async resumo() {
      const [porStatusRaw, abertas] = await Promise.all([
        prisma.request.groupBy({ by: ['status'], _count: true }),
        prisma.request.findMany({
          where: { status: { notIn: STATUS_FINALIZADOS as RequestStatusValue[] } },
          select: {
            id: true,
            codigoInterno: true,
            tituloResumido: true,
            bairro: true,
            status: true,
            createdAt: true,
            assessorResponsavelId: true,
            assessorResponsavel: { select: { nome: true } },
            historico: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
          },
        }),
      ]);

      const porStatus: ContagemStatus[] = TODOS_STATUS.map((status) => ({
        status,
        quantidade: porStatusRaw.find((r) => r.status === status)?._count ?? 0,
      }));

      const bairroMap = new Map<string, number>();
      const assessorMap = new Map<string, { nome: string; quantidade: number }>();
      const paradas: DemandaParada[] = [];
      const agora = Date.now();

      for (const demanda of abertas) {
        const bairro = demanda.bairro ?? 'Sem bairro';
        bairroMap.set(bairro, (bairroMap.get(bairro) ?? 0) + 1);

        const atual = assessorMap.get(demanda.assessorResponsavelId);
        assessorMap.set(demanda.assessorResponsavelId, {
          nome: demanda.assessorResponsavel.nome,
          quantidade: (atual?.quantidade ?? 0) + 1,
        });

        const dataReferencia = demanda.historico[0]?.createdAt ?? demanda.createdAt;
        const diasParada = Math.floor((agora - dataReferencia.getTime()) / (24 * 60 * 60 * 1000));
        if (diasParada >= DIAS_PARA_CONSIDERAR_PARADA) {
          paradas.push({
            id: demanda.id,
            codigoInterno: demanda.codigoInterno,
            tituloResumido: demanda.tituloResumido,
            assessorResponsavelNome: demanda.assessorResponsavel.nome,
            status: demanda.status as RequestStatusValue,
            diasParada,
          });
        }
      }

      return {
        porStatus,
        porBairro: Array.from(bairroMap.entries()).map(([bairro, quantidade]) => ({ bairro, quantidade })),
        porAssessor: Array.from(assessorMap.entries()).map(([assessorId, v]) => ({
          assessorId,
          assessorNome: v.nome,
          quantidade: v.quantidade,
        })),
        paradas: paradas.sort((a, b) => b.diasParada - a.diasParada),
      };
    },

    async relatorioPeriodo(inicio, fimExclusivo) {
      const where = { createdAt: { gte: inicio, lt: fimExclusivo } };
      const [porStatusRaw, porTipoRaw, porBairroRaw, porAssessorRaw] = await Promise.all([
        prisma.request.groupBy({ by: ['status'], where, _count: true }),
        prisma.request.groupBy({ by: ['requestTypeId'], where, _count: true }),
        prisma.request.groupBy({ by: ['bairro'], where, _count: true }),
        prisma.request.groupBy({ by: ['assessorResponsavelId'], where, _count: true }),
      ]);

      const [tipos, assessores] = await Promise.all([
        prisma.requestType.findMany({
          where: { id: { in: porTipoRaw.map((t) => t.requestTypeId) } },
          select: { id: true, nome: true },
        }),
        prisma.user.findMany({
          where: { id: { in: porAssessorRaw.map((a) => a.assessorResponsavelId) } },
          select: { id: true, nome: true },
        }),
      ]);

      const porStatus: ContagemStatus[] = TODOS_STATUS.map((status) => ({
        status,
        quantidade: porStatusRaw.find((r) => r.status === status)?._count ?? 0,
      }));
      // Maior primeiro; empate em ordem alfabética, para o mesmo período dar sempre o mesmo relatório.
      const maiorPrimeiro = <T extends { quantidade: number }>(lista: T[], nome: (item: T) => string) =>
        lista.sort((a, b) => b.quantidade - a.quantidade || nome(a).localeCompare(nome(b), 'pt-BR'));

      return {
        total: porStatus.reduce((soma, item) => soma + item.quantidade, 0),
        porStatus,
        porTipo: maiorPrimeiro(
          porTipoRaw.map((t) => ({
            tipo: tipos.find((x) => x.id === t.requestTypeId)?.nome ?? 'Tipo removido',
            quantidade: t._count,
          })),
          (item) => item.tipo,
        ),
        // "Sem bairro" agrupa os nulos e os vazios. Espaços nas pontas e maiúsculas/minúsculas não
        // criam linhas separadas ("Centro", "Centro " e "centro" são o mesmo bairro).
        porBairro: maiorPrimeiro(
          Array.from(
            porBairroRaw
              .reduce((mapa, linha) => {
                const limpo = linha.bairro?.trim() ?? '';
                const nome = limpo || 'Sem bairro';
                const chave = nome.toLocaleLowerCase('pt-BR');
                const atual = mapa.get(chave);
                return mapa.set(chave, { bairro: atual?.bairro ?? nome, quantidade: (atual?.quantidade ?? 0) + linha._count });
              }, new Map<string, { bairro: string; quantidade: number }>())
              .values(),
          ),
          (item) => item.bairro,
        ),
        porAssessor: maiorPrimeiro(
          porAssessorRaw.map((a) => ({
            assessorId: a.assessorResponsavelId,
            assessorNome: assessores.find((x) => x.id === a.assessorResponsavelId)?.nome ?? 'Usuário removido',
            quantidade: a._count,
          })),
          (item) => item.assessorNome,
        ),
      };
    },

    async produtividadeAssessores(mesInicio, mesFim) {
      const assessoresRua = await prisma.user.findMany({
        where: { role: 'ASSESSOR_RUA' as UserRoleValue, ativo: true },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      });

      const contagens = await prisma.request.groupBy({
        by: ['criadoPorId', 'status'],
        where: {
          createdAt: { gte: mesInicio, lt: mesFim },
          criadoPor: { role: 'ASSESSOR_RUA' as UserRoleValue },
        },
        _count: true,
      });

      return assessoresRua.map((assessor) => {
        const porStatus = Object.fromEntries(TODOS_STATUS.map((status) => [status, 0])) as Record<
          RequestStatusValue,
          number
        >;
        let total = 0;
        for (const linha of contagens) {
          if (linha.criadoPorId === assessor.id) {
            porStatus[linha.status as RequestStatusValue] = linha._count;
            total += linha._count;
          }
        }
        return { assessorId: assessor.id, assessorNome: assessor.nome, porStatus, total };
      });
    },
  };
}
