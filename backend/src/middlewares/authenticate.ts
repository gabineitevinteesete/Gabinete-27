import type { RequestHandler } from 'express';
import type { UserRepository } from '../repositories/user.repository.js';
import type { UserRoleValue } from '../utils/jwt.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { HttpError } from './error-handler.js';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRoleValue };
    }
  }
}

export function authenticate(deps: { userRepo: UserRepository }): RequestHandler {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        throw new HttpError(401, 'Token de acesso ausente');
      }
      const token = header.slice('Bearer '.length);
      const payload = verifyAccessToken(token);

      const user = await deps.userRepo.findById(payload.sub);
      if (!user || !user.ativo) {
        throw new HttpError(401, 'Sessão inválida ou usuário desativado');
      }

      req.user = { id: user.id, role: user.role };
      next();
    } catch (err) {
      if (err instanceof HttpError) {
        next(err);
      } else {
        next(new HttpError(401, 'Token de acesso inválido'));
      }
    }
  };
}
