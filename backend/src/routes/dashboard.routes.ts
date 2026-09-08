import { Router } from 'express';
import type { DashboardService } from '../services/dashboard.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createDashboardController } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createDashboardRouter(deps: { dashboardService: DashboardService; userRepo: UserRepository }): Router {
  const router = Router();
  const controller = createDashboardController(deps.dashboardService);
  const auth = authenticate({ userRepo: deps.userRepo });
  const soChefe = requireRole('CHEFE');

  router.use(auth, soChefe);
  router.get('/resumo', asyncHandler(controller.resumo));
  router.get('/produtividade-assessores', asyncHandler(controller.produtividadeAssessores));

  return router;
}
