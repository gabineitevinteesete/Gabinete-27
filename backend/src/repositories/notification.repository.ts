import type { PrismaClient } from '@prisma/client';

export interface NotificacaoItem {
  id: string;
  requestId: string | null;
  tipo: string;
  mensagem: string;
  lida: boolean;
  createdAt: Date;
}

export interface NotificationRepository {
  create(data: { userId: string; requestId?: string; tipo: string; mensagem: string }): Promise<void>;
  /** Uma única gravação para vários avisos (ex.: todos os chefes). */
  createMany(data: { userId: string; requestId?: string; tipo: string; mensagem: string }[]): Promise<void>;
  /** Os `limite` avisos mais recentes da pessoa e o total de não lidos (não só dos listados). */
  listar(userId: string, limite: number): Promise<{ items: NotificacaoItem[]; naoLidas: number }>;
  /** `false` quando o aviso não existe ou é de outra pessoa. */
  marcarLida(id: string, userId: string): Promise<boolean>;
  marcarTodasLidas(userId: string): Promise<void>;
}

export function createNotificationRepository(prisma: PrismaClient): NotificationRepository {
  return {
    async create({ userId, requestId, tipo, mensagem }) {
      await prisma.notification.create({ data: { userId, requestId, tipo, mensagem } });
    },

    async createMany(data) {
      if (data.length === 0) return;
      await prisma.notification.createMany({ data });
    },

    async listar(userId, limite) {
      const [items, naoLidas] = await Promise.all([
        prisma.notification.findMany({
          where: { userId },
          // `id` desempata avisos criados no mesmo instante, para a ordem não variar entre buscas.
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limite,
          select: { id: true, requestId: true, tipo: true, mensagem: true, lida: true, createdAt: true },
        }),
        prisma.notification.count({ where: { userId, lida: false } }),
      ]);
      return { items, naoLidas };
    },

    async marcarLida(id, userId) {
      // `userId` no filtro: ninguém marca (nem descobre) o aviso de outra pessoa.
      const resultado = await prisma.notification.updateMany({ where: { id, userId }, data: { lida: true } });
      return resultado.count > 0;
    },

    async marcarTodasLidas(userId) {
      await prisma.notification.updateMany({ where: { userId, lida: false }, data: { lida: true } });
    },
  };
}
