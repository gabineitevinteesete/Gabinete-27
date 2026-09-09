import type { Request, Response } from 'express';
import type { UserService } from '../services/user.service.js';
import {
  criarUsuarioSchema,
  atualizarRoleSchema,
  definirAtivoSchema,
  usuarioIdParamsSchema,
  editarUsuarioSchema,
  listarUsuariosQuerySchema,
} from '../validators/user.validators.js';
import { getClientIp } from '../utils/request-ip.js';
import { HttpError } from '../middlewares/error-handler.js';
import type { UserRoleValue } from '../utils/jwt.js';

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

    async editar(req: Request, res: Response) {
      const { id: userId } = usuarioIdParamsSchema.parse(req.params);
      const input = editarUsuarioSchema.parse(req.body);
      const result = await userService.editarAssessor({
        userId,
        nome: input.nome,
        telefone: input.telefone,
        atualizadoPorId: req.user!.id,
        ip: getClientIp(req),
      });
      if (result.status === 'telefone_invalido') {
        throw new HttpError(400, 'Telefone inválido');
      }
      if (result.status === 'telefone_duplicado') {
        throw new HttpError(409, 'Já existe um usuário com esse telefone');
      }
      res.json({ success: true, data: result.user });
    },

    async listar(req: Request, res: Response) {
      const { ativo, role } = listarUsuariosQuerySchema.parse(req.query);
      const filter: { ativo?: boolean; role?: UserRoleValue } = {};
      if (ativo !== undefined) filter.ativo = ativo === 'true';
      if (role !== undefined) filter.role = role;
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
