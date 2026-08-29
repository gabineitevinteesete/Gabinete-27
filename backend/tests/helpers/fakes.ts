import type { PublicUser, UserRepository } from '../../src/repositories/user.repository.js';
import type { RefreshTokenRepository } from '../../src/repositories/refresh-token.repository.js';
import type { LoginAttemptRepository } from '../../src/repositories/login-attempt.repository.js';
import type { AuditLogRepository } from '../../src/repositories/audit-log.repository.js';
import type { UserRoleValue } from '../../src/utils/jwt.js';
import { randomUUID } from 'node:crypto';

type StoredUser = PublicUser & { pinHash: string | null };

export function createFakeUserRepo(seed: StoredUser[] = []): UserRepository & { users: StoredUser[] } {
  const users = [...seed];
  return {
    users,
    async findByTelefone(telefone) {
      return users.find((u) => u.telefone === telefone) ?? null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async create({ nome, telefone, role }) {
      const now = new Date();
      const user: StoredUser = {
        id: randomUUID(),
        nome,
        telefone,
        role,
        ativo: true,
        pinDefinido: false,
        pinHash: null,
        createdAt: now,
        updatedAt: now,
      };
      users.push(user);
      return user;
    },
    async setPinHash(id, pinHash) {
      const user = users.find((u) => u.id === id);
      if (user) {
        user.pinHash = pinHash;
        user.pinDefinido = true;
      }
    },
    async clearPin(id) {
      const user = users.find((u) => u.id === id);
      if (user) {
        user.pinHash = null;
        user.pinDefinido = false;
      }
    },
    async updateRole(id, role) {
      const user = users.find((u) => u.id === id)!;
      user.role = role as UserRoleValue;
      return user;
    },
    async setAtivo(id, ativo) {
      const user = users.find((u) => u.id === id)!;
      user.ativo = ativo;
      return user;
    },
    async list(filter) {
      // Cópia rasa: sem isso o caso sem filtro devolveria o array interno por referência e
      // um caller poderia mutar o estado do fake sem passar pelos métodos do repositório.
      return filter?.ativo === undefined ? [...users] : users.filter((u) => u.ativo === filter.ativo);
    },
  };
}

export function createFakeRefreshTokenRepo(): RefreshTokenRepository & {
  tokens: { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }[];
} {
  const tokens: { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }[] = [];
  return {
    tokens,
    async create({ userId, tokenHash, expiresAt }) {
      tokens.push({ id: randomUUID(), userId, tokenHash, expiresAt, revokedAt: null });
    },
    async findValidByHash(tokenHash) {
      return tokens.find((t) => t.tokenHash === tokenHash) ?? null;
    },
    async revoke(id) {
      const token = tokens.find((t) => t.id === id);
      if (token) token.revokedAt = new Date();
    },
    async revokeAllForUser(userId) {
      for (const t of tokens) {
        if (t.userId === userId && !t.revokedAt) t.revokedAt = new Date();
      }
    },
  };
}

export function createFakeLoginAttemptRepo(): LoginAttemptRepository & {
  attempts: { telefone: string; sucesso: boolean; createdAt: Date }[];
} {
  const attempts: { telefone: string; sucesso: boolean; createdAt: Date }[] = [];
  return {
    attempts,
    async record({ telefone, sucesso }) {
      attempts.push({ telefone, sucesso, createdAt: new Date() });
    },
    async countRecentFailures(telefone, sinceMs) {
      const limite = Date.now() - sinceMs;
      return attempts.filter((a) => a.telefone === telefone && !a.sucesso && a.createdAt.getTime() >= limite).length;
    },
    async getOldestRecentFailureAt(telefone, sinceMs) {
      const limite = Date.now() - sinceMs;
      const recent = attempts.filter((a) => a.telefone === telefone && !a.sucesso && a.createdAt.getTime() >= limite);
      if (recent.length === 0) return null;
      const oldest = recent.reduce((min, a) => (a.createdAt.getTime() < min.createdAt.getTime() ? a : min));
      return oldest.createdAt;
    },
  };
}

export function createFakeAuditLogRepo(): AuditLogRepository & { records: unknown[] } {
  const records: unknown[] = [];
  return {
    records,
    async record(data) {
      records.push(data);
    },
  };
}
