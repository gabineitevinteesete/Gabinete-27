import { Router } from 'express';
import multer from 'multer';
import type { RequestService } from '../services/request.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createRequestController } from '../controllers/request.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 4 },
});

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createRequestRouter(deps: { requestService: RequestService; userRepo: UserRepository }): Router {
  const router = Router();
  const controller = createRequestController(deps.requestService);
  const auth = authenticate({ userRepo: deps.userRepo });

  router.post('/', auth, upload.array('fotos', 4), asyncHandler(controller.criar));
  router.get('/', auth, asyncHandler(controller.listar));
  router.get('/:id', auth, asyncHandler(controller.buscarPorId));
  router.patch('/:id', auth, asyncHandler(controller.editar));

  return router;
}
