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
import { createRequestTypeRepository } from './repositories/request-type.repository.js';
import type { PhotoUploader } from './services/cloudinary-uploader.service.js';
import { createCloudinaryUploader } from './services/cloudinary-uploader.service.js';
import { createRequestRepository } from './repositories/request.repository.js';
import { RequestService } from './services/request.service.js';
import { createRequestRouter } from './routes/request.routes.js';
import { AuthService } from './services/auth.service.js';
import { UserService } from './services/user.service.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createUserRouter } from './routes/user.routes.js';
import { createRequestTypeRouter } from './routes/request-type.routes.js';
import { createInternalNoteRepository } from './repositories/internal-note.repository.js';
import { InternalNoteService } from './services/internal-note.service.js';
import { createDashboardRepository } from './repositories/dashboard.repository.js';
import { DashboardService } from './services/dashboard.service.js';
import { createDashboardRouter } from './routes/dashboard.routes.js';

export function createApp(prisma: PrismaClient, deps?: { photoUploader?: PhotoUploader }): express.Express {
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
  const requestTypeRepo = createRequestTypeRepository(prisma);
  const requestRepo = createRequestRepository(prisma);
  const photoUploader =
    deps?.photoUploader ??
    createCloudinaryUploader({
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    });
  const requestService = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });

  const internalNoteRepo = createInternalNoteRepository(prisma);
  const internalNoteService = new InternalNoteService({ internalNoteRepo, requestRepo });

  const dashboardRepo = createDashboardRepository(prisma);
  const dashboardService = new DashboardService({ dashboardRepo });

  const authService = new AuthService({ userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo });
  const userService = new UserService({ userRepo, auditLogRepo });

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/auth', createAuthRouter({ authService, userRepo }));
  app.use('/usuarios', createUserRouter({ userService, userRepo }));
  app.use('/tipos-demanda', createRequestTypeRouter({ requestTypeRepo, userRepo }));
  app.use('/demandas', createRequestRouter({ requestService, userRepo, internalNoteService }));
  app.use('/dashboard', createDashboardRouter({ dashboardService, userRepo }));

  app.use(errorHandler);

  return app;
}
