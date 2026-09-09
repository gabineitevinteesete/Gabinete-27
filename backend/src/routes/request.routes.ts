import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import type { RequestService } from '../services/request.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createRequestController } from '../controllers/request.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';
import type { InternalNoteService } from '../services/internal-note.service.js';
import { createInternalNoteController } from '../controllers/internal-note.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 4 },
});

// Cada POST aqui decodifica até 4 imagens em memória nativa (sharp). O limite existe para
// que um usuário autenticado não consiga transformar isso em um dreno de CPU/memória.
// Folgado de propósito (um assessor em campo nunca chega perto): a suíte de integração
// sozinha faz ~25 chamadas a este router, então o teto fica bem acima disso.
const demandasLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitas requisições. Tente novamente em instantes.' },
});

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createRequestRouter(deps: {
  requestService: RequestService;
  userRepo: UserRepository;
  internalNoteService: InternalNoteService;
}): Router {
  const router = Router();
  const controller = createRequestController(deps.requestService);
  const internalNoteController = createInternalNoteController(deps.internalNoteService);
  const auth = authenticate({ userRepo: deps.userRepo });

  router.use(demandasLimiter);

  router.post('/', auth, upload.array('fotos', 4), asyncHandler(controller.criar));
  router.get('/', auth, asyncHandler(controller.listar));
  router.get('/:id', auth, asyncHandler(controller.buscarPorId));
  router.patch('/:id', auth, asyncHandler(controller.editar));
  router.patch('/:id/status', auth, requireRole('ASSESSOR_GABINETE', 'CHEFE'), asyncHandler(controller.mudarStatus));
  router.get('/:id/historico-status', auth, asyncHandler(controller.historicoStatus));
  router.patch('/:id/reatribuir', auth, requireRole('CHEFE'), asyncHandler(controller.reatribuir));

  const soGabineteOuChefe = requireRole('ASSESSOR_GABINETE', 'CHEFE');
  router.post('/:id/observacoes', auth, soGabineteOuChefe, asyncHandler(internalNoteController.criar));
  router.get('/:id/observacoes', auth, soGabineteOuChefe, asyncHandler(internalNoteController.listar));
  router.patch('/:id/observacoes/:notaId', auth, soGabineteOuChefe, asyncHandler(internalNoteController.editar));
  router.delete('/:id/observacoes/:notaId', auth, soGabineteOuChefe, asyncHandler(internalNoteController.apagar));

  return router;
}
