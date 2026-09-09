import { Router } from 'express';
import type { DutyRosterService } from '../services/duty-roster.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createDutyRosterController } from '../controllers/duty-roster.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createDutyRosterRouter(deps: {
  dutyRosterService: DutyRosterService;
  userRepo: UserRepository;
}): Router {
  const router = Router();
  const controller = createDutyRosterController(deps.dutyRosterService);
  const auth = authenticate({ userRepo: deps.userRepo });
  const soChefe = requireRole('CHEFE');

  router.get('/', auth, asyncHandler(controller.listarMes));
  router.put('/:data', auth, soChefe, asyncHandler(controller.substituirDia));

  return router;
}
