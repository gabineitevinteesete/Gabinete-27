import type { PrismaClient } from '@prisma/client';
import type { UserRoleValue } from '../utils/jwt.js';

export type PublicUser = {
  id: string;
  nome: string;
  telefone: string;
  role: UserRoleValue;
  ativo: boolean;
  pinDefinido: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toPublicUser<T extends PublicUser>(user: T): PublicUser {
  const { id, nome, telefone, role, ativo, pinDefinido, createdAt, updatedAt } = user;
  return { id, nome, telefone, role: role as UserRoleValue, ativo, pinDefinido, createdAt, updatedAt };
}

export interface UserRepository {
  findByTelefone(telefone: string): Promise<(PublicUser & { pinHash: string | null }) | null>;
  findById(id: string): Promise<(PublicUser & { pinHash: string | null }) | null>;
  create(data: { nome: string; telefone: string; role: UserRoleValue }): Promise<PublicUser>;
  setPinHash(id: string, pinHash: string): Promise<void>;
  clearPin(id: string): Promise<void>;
  updateRole(id: string, role: UserRoleValue): Promise<PublicUser>;
  setAtivo(id: string, ativo: boolean): Promise<PublicUser>;
  list(filter?: { ativo?: boolean }): Promise<PublicUser[]>;
}

export function createUserRepository(prisma: PrismaClient): UserRepository {
  return {
    async findByTelefone(telefone) {
      const user = await prisma.user.findUnique({ where: { telefone } });
      return user ? { ...toPublicUser(user), pinHash: user.pinHash } : null;
    },
    async findById(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? { ...toPublicUser(user), pinHash: user.pinHash } : null;
    },
    async create({ nome, telefone, role }) {
      const user = await prisma.user.create({
        data: { nome, telefone, role, pinDefinido: false, ativo: true },
      });
      return toPublicUser(user);
    },
    async setPinHash(id, pinHash) {
      await prisma.user.update({ where: { id }, data: { pinHash, pinDefinido: true } });
    },
    async clearPin(id) {
      await prisma.user.update({ where: { id }, data: { pinHash: null, pinDefinido: false } });
    },
    async updateRole(id, role) {
      const user = await prisma.user.update({ where: { id }, data: { role } });
      return toPublicUser(user);
    },
    async setAtivo(id, ativo) {
      const user = await prisma.user.update({ where: { id }, data: { ativo } });
      return toPublicUser(user);
    },
    async list(filter) {
      const users = await prisma.user.findMany({
        where: filter?.ativo === undefined ? {} : { ativo: filter.ativo },
        orderBy: { nome: 'asc' },
      });
      return users.map(toPublicUser);
    },
  };
}
