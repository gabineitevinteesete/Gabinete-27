import type { Request, Response } from 'express';
import type { UserService } from '../services/user.service.js';
import {
  criarUsuarioSchema,
  atualizarRoleSchema,
  definirAtivoSchema,
  usuarioIdParamsSchema,
} from '../validators/user.validators.js';
import { getClientIp } from '../utils/request-ip.js';
import { HttpError } from '../middlewares/error-handler.js';

const ERRO_ULTIMO_CHEFE = 'Não é possível remover o último chefe ativo do gabinete';

export function createUserController(userService: UserService) {
  return {
    async criar(req: Request, res: Response) {
      const input = criarUsuarioSchema.parse(req.body);
      const result = await userService.criarAssessor({
        ...input,
        criadoPorId: req.user!.id,
        ip: getClientIp(req),
      });

      if (result.status === 'ok') {
        res.status(201).json({ success: true, data: result.user });
        return;
      }
      if (result.status === 'telefone_invalido') {
        throw new HttpError(400, 'Telefone inválido');
      }
      throw new HttpError(409, 'Já existe um usuário com esse telefone');
    },

    async listar(req: Request, res: Response) {
      const ativoParam = req.query.ativo;
      const filter = ativoParam === undefined ? undefined : { ativo: ativoParam === 'true' };
      const usuarios = await userService.listar(filter);
      res.json({ success: true, data: usuarios });
    },

    async atualizarRole(req: Request, res: Response) {
      const { id: userId } = usuarioIdParamsSchema.parse(req.params);
      const input = atualizarRoleSchema.parse(req.body);
      const result = await userService.atualizarRole({
        userId,
        novoRole: input.role,
        atualizadoPorId: req.user!.id,
        ip: getClientIp(req),
      });
      if (result.status === 'ultimo_chefe') {
        throw new HttpError(409, ERRO_ULTIMO_CHEFE);
      }
      res.json({ success: true, data: result.user });
    },

    async definirAtivo(req: Request, res: Response) {
      const { id: userId } = usuarioIdParamsSchema.parse(req.params);
      const input = definirAtivoSchema.parse(req.body);
      const result = await userService.definirAtivo({
        userId,
        ativo: input.ativo,
        atualizadoPorId: req.user!.id,
        ip: getClientIp(req),
      });
      if (result.status === 'ultimo_chefe') {
        throw new HttpError(409, ERRO_ULTIMO_CHEFE);
      }
      res.json({ success: true, data: result.user });
    },
  };
}
