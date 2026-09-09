import type { PrismaClient } from '@prisma/client';

export interface RequestTypeSummary {
  id: string;
  nome: string;
  exigeDescricaoObrigatoria: boolean;
}

export interface RequestTypeRepository {
  listActive(): Promise<RequestTypeSummary[]>;
  findById(id: string): Promise<(RequestTypeSummary & { ativo: boolean }) | null>;
}

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
      const tipo = await prisma.requestType.findUnique({
        where: { id },
        select: { id: true, nome: true, exigeDescricaoObrigatoria: true, ativo: true },
      });
      return tipo;
    },
  };
}
