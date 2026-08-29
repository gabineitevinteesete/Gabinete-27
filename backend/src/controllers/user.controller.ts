import type { Request, Response } from 'express';
import type { UserService } from '../services/user.service.js';
import { criarUsuarioSchema, atualizarRoleSchema, definirAtivoSchema } from '../validators/user.validators.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createUserController(userService: UserService) {
  return {
    async criar(req: Request, res: Response) {
      const input = criarUsuarioSchema.parse(req.body);
      const result = await userService.criarAssessor({ ...input, criadoPorId: req.user!.id });

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
      const userId = req.params.id;
      if (!userId) throw new HttpError(400, 'Parâmetro id ausente');
      const input = atualizarRoleSchema.parse(req.body);
      const usuario = await userService.atualizarRole({ userId, novoRole: input.role, atualizadoPorId: req.user!.id });
      res.json({ success: true, data: usuario });
    },

    async definirAtivo(req: Request, res: Response) {
      const userId = req.params.id;
      if (!userId) throw new HttpError(400, 'Parâmetro id ausente');
      const input = definirAtivoSchema.parse(req.body);
      const usuario = await userService.definirAtivo({ userId, ativo: input.ativo, atualizadoPorId: req.user!.id });
      res.json({ success: true, data: usuario });
    },
  };
}
