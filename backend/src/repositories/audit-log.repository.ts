import type { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export interface AuditLogRepository {
  record(data: {
    actorUserId?: string;
    acao: string;
    entidade: string;
    entidadeId?: string;
    detalhes?: unknown;
    ip?: string;
  }): Promise<void>;
}

export function createAuditLogRepository(prisma: PrismaClient): AuditLogRepository {
  return {
    async record({ actorUserId, acao, entidade, entidadeId, detalhes, ip }) {
      await prisma.auditLog.create({
        data: {
          actorUserId,
          acao,
          entidade,
          entidadeId,
          detalhes: detalhes as Prisma.InputJsonValue | undefined,
          ip,
        },
      });
    },
  };
}
