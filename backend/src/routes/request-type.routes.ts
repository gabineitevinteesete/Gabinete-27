import { Router } from 'express';
import type { RequestTypeService } from '../services/request-type.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createRequestTypeController } from '../controllers/request-type.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createRequestTypeRouter(deps: {
  requestTypeService: RequestTypeService;
  userRepo: UserRepository;
}): Router {
  const router = Router();
  const controller = createRequestTypeController(deps.requestTypeService);
  const auth = authenticate({ userRepo: deps.userRepo });
  const soChefe = requireRole('CHEFE');

  router.get('/', auth, asyncHandler(controller.listar));
  router.get('/todos', auth, soChefe, asyncHandler(controller.listarTodos));
  router.post('/', auth, soChefe, asyncHandler(controller.criar));
  router.patch('/:id', auth, soChefe, asyncHandler(controller.editar));
  router.patch('/:id/ativo', auth, soChefe, asyncHandler(controller.definirAtivo));

  return router;
}
