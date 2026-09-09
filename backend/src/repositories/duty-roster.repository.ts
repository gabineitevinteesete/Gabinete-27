import type { PrismaClient } from '@prisma/client';

export type LocalEscalaValue = 'GABINETE' | 'RUA';

export interface AtribuicaoEscala {
  userId: string;
  userNome: string;
  local: LocalEscalaValue;
}

export interface DutyRosterRepository {
  listarMes(mesInicio: Date, mesFim: Date): Promise<Record<string, AtribuicaoEscala[]>>;
  substituirDia(data: Date, atribuicoes: { userId: string; local: LocalEscalaValue }[]): Promise<void>;
}

export function createDutyRosterRepository(prisma: PrismaClient): DutyRosterRepository {
  return {
    async listarMes(mesInicio, mesFim) {
      const entradas = await prisma.dutyRosterEntry.findMany({
        where: { data: { gte: mesInicio, lt: mesFim } },
        include: { user: { select: { nome: true } } },
        orderBy: { data: 'asc' },
      });

      const dias: Record<string, AtribuicaoEscala[]> = {};
      for (const entrada of entradas) {
        const chave = entrada.data.toISOString().slice(0, 10);
        dias[chave] ??= [];
        dias[chave]!.push({
          userId: entrada.userId,
          userNome: entrada.user.nome,
          local: entrada.local as LocalEscalaValue,
        });
      }
      return dias;
    },

    async substituirDia(data, atribuicoes) {
      await prisma.$transaction([
        prisma.dutyRosterEntry.deleteMany({ where: { data } }),
        prisma.dutyRosterEntry.createMany({
          data: atribuicoes.map((a) => ({ data, userId: a.userId, local: a.local })),
        }),
      ]);
    },
  };
}
