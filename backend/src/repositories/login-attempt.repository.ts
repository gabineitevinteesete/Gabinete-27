import type { PrismaClient } from '@prisma/client';

export interface LoginAttemptRepository {
  record(data: { telefone: string; sucesso: boolean; ip?: string; userAgent?: string }): Promise<void>;
  countRecentFailures(telefone: string, sinceMs: number): Promise<number>;
  getOldestRecentFailureAt(telefone: string, sinceMs: number): Promise<Date | null>;
}

export function createLoginAttemptRepository(prisma: PrismaClient): LoginAttemptRepository {
  return {
    async record({ telefone, sucesso, ip, userAgent }) {
      await prisma.loginAttempt.create({ data: { telefone, sucesso, ip, userAgent } });
    },
    async countRecentFailures(telefone, sinceMs) {
      return prisma.loginAttempt.count({
        where: {
          telefone,
          sucesso: false,
          createdAt: { gte: new Date(Date.now() - sinceMs) },
        },
      });
    },
    async getOldestRecentFailureAt(telefone, sinceMs) {
      const oldest = await prisma.loginAttempt.findFirst({
        where: {
          telefone,
          sucesso: false,
          createdAt: { gte: new Date(Date.now() - sinceMs) },
        },
        orderBy: { createdAt: 'asc' },
      });
      return oldest?.createdAt ?? null;
    },
  };
}
