import type { PrismaClient } from '@prisma/client';

export interface InternalNoteItem {
  id: string;
  requestId: string;
  autorId: string;
  autorNome: string;
  texto: string;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface InternalNoteRepository {
  create(requestId: string, autorId: string, texto: string): Promise<InternalNoteItem>;
  list(requestId: string): Promise<InternalNoteItem[]>;
  findById(id: string): Promise<InternalNoteItem | null>;
  update(id: string, texto: string): Promise<InternalNoteItem>;
  delete(id: string): Promise<void>;
}

const INCLUDE_AUTOR = { autor: { select: { nome: true } } } as const;

function toItem(row: {
  id: string;
  requestId: string;
  autorId: string;
  autor: { nome: string };
  texto: string;
  createdAt: Date;
  updatedAt: Date | null;
}): InternalNoteItem {
  return {
    id: row.id,
    requestId: row.requestId,
    autorId: row.autorId,
    autorNome: row.autor.nome,
    texto: row.texto,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createInternalNoteRepository(prisma: PrismaClient): InternalNoteRepository {
  return {
    async create(requestId, autorId, texto) {
      const criada = await prisma.internalNote.create({
        data: { requestId, autorId, texto },
        include: INCLUDE_AUTOR,
      });
      return toItem(criada);
    },

    async list(requestId) {
      const rows = await prisma.internalNote.findMany({
        where: { requestId },
        include: INCLUDE_AUTOR,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toItem);
    },

    async findById(id) {
      const row = await prisma.internalNote.findUnique({
        where: { id },
        include: INCLUDE_AUTOR,
      });
      return row ? toItem(row) : null;
    },

    async update(id, texto) {
      const atualizada = await prisma.internalNote.update({
        where: { id },
        data: { texto, updatedAt: new Date() },
        include: INCLUDE_AUTOR,
      });
      return toItem(atualizada);
    },

    async delete(id) {
      await prisma.internalNote.delete({ where: { id } });
    },
  };
}
