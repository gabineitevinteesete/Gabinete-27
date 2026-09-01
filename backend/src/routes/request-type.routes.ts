import { Router } from 'express';
import type { RequestTypeRepository } from '../repositories/request-type.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createRequestTypeController } from '../controllers/request-type.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createRequestTypeRouter(deps: {
  requestTypeRepo: RequestTypeRepository;
  userRepo: UserRepository;
}): Router {
  const router = Router();
  const controller = createRequestTypeController(deps.requestTypeRepo);
  const auth = authenticate({ userRepo: deps.userRepo });

  router.get('/', auth, asyncHandler(controller.listar));

  return router;
}
