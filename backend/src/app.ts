import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from './config/env.js';
import { errorHandler } from './middlewares/error-handler.js';
import { createUserRepository } from './repositories/user.repository.js';
import { createRefreshTokenRepository } from './repositories/refresh-token.repository.js';
import { createLoginAttemptRepository } from './repositories/login-attempt.repository.js';
import { createAuditLogRepository } from './repositories/audit-log.repository.js';
import { AuthService } from './services/auth.service.js';
import { UserService } from './services/user.service.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createUserRouter } from './routes/user.routes.js';

export function createApp(prisma: PrismaClient): express.Express {
  const env = loadEnv();
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const userRepo = createUserRepository(prisma);
  const refreshTokenRepo = createRefreshTokenRepository(prisma);
  const loginAttemptRepo = createLoginAttemptRepository(prisma);
  const auditLogRepo = createAuditLogRepository(prisma);

  const authService = new AuthService({ userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo });
  const userService = new UserService({ userRepo, auditLogRepo });

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/auth', createAuthRouter({ authService, userRepo }));
  app.use('/usuarios', createUserRouter({ userService, userRepo }));

  app.use(errorHandler);

  return app;
}
