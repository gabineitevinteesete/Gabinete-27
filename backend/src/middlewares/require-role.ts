import type { RequestHandler } from 'express';
import type { UserRoleValue } from '../utils/jwt.js';
import { HttpError } from './error-handler.js';

export function requireRole(...roles: UserRoleValue[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, 'Acesso não permitido para este perfil'));
      return;
    }
    next();
  };
}
