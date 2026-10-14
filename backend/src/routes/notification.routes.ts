import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { NotificacaoService } from '../services/notificacao.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { authenticate } from '../middlewares/authenticate.js';
import { HttpError } from '../middlewares/error-handler.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

const idParamsSchema = z.object({ id: z.string().uuid() });

export function createNotificationRouter(deps: {
  notificacaoService: NotificacaoService;
  userRepo: UserRepository;
}): Router {
  const router = Router();
  const auth = authenticate({ userRepo: deps.userRepo });

  router.get(
    '/',
    auth,
    asyncHandler(async (req: Request, res: Response) => {
      const dados = await deps.notificacaoService.listar(req.user!.id);
      res.json({ success: true, data: dados });
    }),
  );

  // Antes de '/:id/lida' para 'lidas' nunca ser lido como id.
  router.patch(
    '/lidas',
    auth,
    asyncHandler(async (req: Request, res: Response) => {
      await deps.notificacaoService.marcarTodasLidas(req.user!.id);
      res.json({ success: true, data: { ok: true } });
    }),
  );

  router.patch(
    '/:id/lida',
    auth,
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = idParamsSchema.parse(req.params);
      const encontrada = await deps.notificacaoService.marcarLida(id, req.user!.id);
      if (!encontrada) throw new HttpError(404, 'Aviso não encontrado');
      res.json({ success: true, data: { ok: true } });
    }),
  );

  return router;
}
