import type { PrismaClient } from '@prisma/client';

export interface LoginAttemptRepository {
  record(data: { telefone: string; sucesso: boolean; ip?: string; userAgent?: string }): Promise<void>;
  countRecentFailures(telefone: string, sinceMs: number): Promise<number>;
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
  };
}
