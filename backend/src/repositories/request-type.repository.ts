import type { PrismaClient } from '@prisma/client';

export interface RequestTypeSummary {
  id: string;
  nome: string;
  exigeDescricaoObrigatoria: boolean;
}

export interface RequestTypeRepository {
  listActive(): Promise<RequestTypeSummary[]>;
  findById(id: string): Promise<(RequestTypeSummary & { ativo: boolean }) | null>;
  findByNome(nome: string): Promise<(RequestTypeSummary & { ativo: boolean }) | null>;
  listAll(): Promise<(RequestTypeSummary & { ativo: boolean })[]>;
  create(data: { nome: string; exigeDescricaoObrigatoria: boolean }): Promise<RequestTypeSummary & { ativo: boolean }>;
  update(
    id: string,
    data: { nome?: string; exigeDescricaoObrigatoria?: boolean },
  ): Promise<RequestTypeSummary & { ativo: boolean }>;
  setAtivo(id: string, ativo: boolean): Promise<RequestTypeSummary & { ativo: boolean }>;
}

const SELECAO_ADMIN = { id: true, nome: true, exigeDescricaoObrigatoria: true, ativo: true } as const;

export function createRequestTypeRepository(prisma: PrismaClient): RequestTypeRepository {
  return {
    async listActive() {
      const tipos = await prisma.requestType.findMany({
        where: { ativo: true },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, exigeDescricaoObrigatoria: true },
      });
      return tipos;
    },
    async findById(id) {
      const tipo = await prisma.requestType.findUnique({ where: { id }, select: SELECAO_ADMIN });
      return tipo;
    },
    async findByNome(nome) {
      const tipo = await prisma.requestType.findUnique({ where: { nome }, select: SELECAO_ADMIN });
      return tipo;
    },
    async listAll() {
      const tipos = await prisma.requestType.findMany({ orderBy: { nome: 'asc' }, select: SELECAO_ADMIN });
      return tipos;
    },
    async create({ nome, exigeDescricaoObrigatoria }) {
      const tipo = await prisma.requestType.create({
        data: { nome, exigeDescricaoObrigatoria, ativo: true },
        select: SELECAO_ADMIN,
      });
      return tipo;
    },
    async update(id, data) {
      const tipo = await prisma.requestType.update({
        where: { id },
        data: {
          ...(data.nome !== undefined ? { nome: data.nome } : {}),
          ...(data.exigeDescricaoObrigatoria !== undefined
            ? { exigeDescricaoObrigatoria: data.exigeDescricaoObrigatoria }
            : {}),
        },
        select: SELECAO_ADMIN,
      });
      return tipo;
    },
    async setAtivo(id, ativo) {
      const tipo = await prisma.requestType.update({ where: { id }, data: { ativo }, select: SELECAO_ADMIN });
      return tipo;
    },
  };
}
