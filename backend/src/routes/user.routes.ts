import { Router } from 'express';
import type { UserService } from '../services/user.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createUserController } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createUserRouter(deps: { userService: UserService; userRepo: UserRepository }): Router {
  const router = Router();
  const controller = createUserController(deps.userService);
  const auth = authenticate({ userRepo: deps.userRepo });
  const soChefe = requireRole('CHEFE');

  router.use(auth, soChefe);
  router.post('/', asyncHandler(controller.criar));
  router.get('/', asyncHandler(controller.listar));
  router.patch('/:id', asyncHandler(controller.editar));
  router.patch('/:id/role', asyncHandler(controller.atualizarRole));
  router.patch('/:id/ativo', asyncHandler(controller.definirAtivo));

  return router;
}
