import type { Request, Response } from 'express';
import type { RequestTypeService } from '../services/request-type.service.js';
import {
  criarTipoSchema,
  editarTipoSchema,
  definirAtivoTipoSchema,
  tipoIdParamsSchema,
} from '../validators/request-type.validators.js';
import { getClientIp } from '../utils/request-ip.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createRequestTypeController(service: RequestTypeService) {
  return {
    async listar(_req: Request, res: Response) {
      const tipos = await service.listarAtivos();
      res.json({ success: true, data: tipos });
    },

    async listarTodos(_req: Request, res: Response) {
      const tipos = await service.listarTodos();
      res.json({ success: true, data: tipos });
    },

    async criar(req: Request, res: Response) {
      const input = criarTipoSchema.parse(req.body);
      const result = await service.criar({
        ...input,
        criadoPorId: req.user!.id,
        ip: getClientIp(req),
      });
      if (result.status === 'nome_duplicado') {
        throw new HttpError(409, 'Já existe um tipo de demanda com esse nome');
      }
      res.status(201).json({ success: true, data: result.tipo });
    },

    async editar(req: Request, res: Response) {
      const { id: tipoId } = tipoIdParamsSchema.parse(req.params);
      const input = editarTipoSchema.parse(req.body);
      const result = await service.editar({
        tipoId,
        nome: input.nome,
        exigeDescricaoObrigatoria: input.exigeDescricaoObrigatoria,
        atualizadoPorId: req.user!.id,
        ip: getClientIp(req),
      });
      if (result.status === 'nao_encontrado') {
        throw new HttpError(404, 'Tipo de demanda não encontrado');
      }
      if (result.status === 'nome_duplicado') {
        throw new HttpError(409, 'Já existe um tipo de demanda com esse nome');
      }
      res.json({ success: true, data: result.tipo });
    },

    async definirAtivo(req: Request, res: Response) {
      const { id: tipoId } = tipoIdParamsSchema.parse(req.params);
      const input = definirAtivoTipoSchema.parse(req.body);
      const result = await service.definirAtivo({
        tipoId,
        ativo: input.ativo,
        atualizadoPorId: req.user!.id,
        ip: getClientIp(req),
      });
      if (result.status === 'nao_encontrado') {
        throw new HttpError(404, 'Tipo de demanda não encontrado');
      }
      res.json({ success: true, data: result.tipo });
    },
  };
}
