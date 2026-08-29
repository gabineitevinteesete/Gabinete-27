import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { AuthService } from '../services/auth.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createAuthRouter(deps: { authService: AuthService; userRepo: UserRepository }): Router {
  const router = Router();
  const controller = createAuthController(deps.authService);
  const auth = authenticate({ userRepo: deps.userRepo });

  router.post('/login', loginLimiter, asyncHandler(controller.login));
  router.post('/primeiro-acesso', loginLimiter, asyncHandler(controller.primeiroAcesso));
  router.post('/refresh', asyncHandler(controller.refresh));
  router.post('/logout', asyncHandler(controller.logout));
  router.post('/trocar-pin', auth, asyncHandler(controller.trocarPin));
  router.post('/usuarios/:id/resetar-acesso', auth, requireRole('CHEFE'), asyncHandler(controller.resetarAcesso));

  return router;
}
