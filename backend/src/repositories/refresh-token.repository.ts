import type { PrismaClient } from '@prisma/client';

export interface RefreshTokenRepository {
  create(data: { userId: string; tokenHash: string; expiresAt: Date; createdByIp?: string }): Promise<void>;
  findValidByHash(
    tokenHash: string,
  ): Promise<{ id: string; userId: string; expiresAt: Date; revokedAt: Date | null } | null>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export function createRefreshTokenRepository(prisma: PrismaClient): RefreshTokenRepository {
  return {
    async create({ userId, tokenHash, expiresAt, createdByIp }) {
      await prisma.refreshToken.create({
        data: { userId, tokenHash, expiresAt, createdByIp },
      });
    },
    async findValidByHash(tokenHash) {
      const token = await prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (!token) return null;
      return {
        id: token.id,
        userId: token.userId,
        expiresAt: token.expiresAt,
        revokedAt: token.revokedAt,
      };
    },
    async revoke(id) {
      await prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
    },
    async revokeAllForUser(userId) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
  };
}
