import type { PrismaClient } from '@prisma/client';
import type { RequestStatusValue } from '../utils/request-status.js';

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

export interface DashboardRepository {
  resumo(): Promise<ResumoDashboard>;
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
  };
}
