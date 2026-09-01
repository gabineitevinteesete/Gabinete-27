import type { Request, Response } from 'express';
import type { RequestService } from '../services/request.service.js';
import { criarDemandaSchema, editarDemandaSchema, listarDemandasQuerySchema, demandaIdParamsSchema } from '../validators/request.validators.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createRequestController(requestService: RequestService) {
  return {
    async criar(req: Request, res: Response) {
      const dados = criarDemandaSchema.parse(req.body);
      const arquivos = (req.files as Express.Multer.File[] | undefined) ?? [];

      const resultado = await requestService.criar({
        ...dados,
        assessorResponsavelId: req.user!.id,
        fotos: arquivos.map((arquivo) => arquivo.buffer),
      });

      if (resultado.status === 'ok') {
        res.status(201).json({ success: true, data: resultado.demanda });
        return;
      }
      if (resultado.status === 'tipo_invalido') {
        throw new HttpError(400, 'Tipo de demanda inválido ou desativado');
      }
      if (resultado.status === 'descricao_outro_obrigatoria') {
        throw new HttpError(400, 'Descrição do assunto é obrigatória quando o tipo é "Outros"');
      }
      if (resultado.status === 'quantidade_fotos_invalida') {
        throw new HttpError(400, 'Envie de 2 a 4 fotos');
      }
      if (resultado.status === 'autorizacao_obrigatoria') {
        throw new HttpError(400, 'É necessário autorizar o uso e armazenamento dos dados');
      }
      throw new HttpError(400, `Foto inválida (posição ${resultado.indice + 1}). Envie apenas JPG, PNG ou WebP.`);
    },

    async listar(req: Request, res: Response) {
      const query = listarDemandasQuerySchema.parse(req.query);
      const { pagina, tamanhoPagina, ...filtro } = query;
      const resultado = await requestService.listar(filtro, { pagina, tamanhoPagina }, req.user!);
      res.json({
        success: true,
        data: { items: resultado.items, total: resultado.total, pagina, tamanhoPagina },
      });
    },

    async buscarPorId(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const resultado = await requestService.buscarPorId(id, req.user!);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você não tem acesso a esta demanda');
      res.json({ success: true, data: resultado.demanda });
    },

    async editar(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const dados = editarDemandaSchema.parse(req.body);
      const resultado = await requestService.editar(id, dados, req.user!);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você não tem permissão para editar esta demanda');
      res.json({ success: true, data: resultado.demanda });
    },
  };
}
