import type { Request, Response } from 'express';
import type { InternalNoteService } from '../services/internal-note.service.js';
import { criarObservacaoSchema, editarObservacaoSchema, observacaoIdParamsSchema } from '../validators/internal-note.validators.js';
import { demandaIdParamsSchema } from '../validators/request.validators.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createInternalNoteController(internalNoteService: InternalNoteService) {
  return {
    async criar(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const dados = criarObservacaoSchema.parse(req.body);
      const resultado = await internalNoteService.criar(id, req.user!.id, dados.texto);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      res.status(201).json({ success: true, data: resultado.observacao });
    },

    async listar(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const resultado = await internalNoteService.listar(id);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      res.json({ success: true, data: resultado.observacoes });
    },

    async editar(req: Request, res: Response) {
      const { id, notaId } = observacaoIdParamsSchema.parse(req.params);
      const dados = editarObservacaoSchema.parse(req.body);
      const resultado = await internalNoteService.editar(id, notaId, dados.texto, req.user!.id);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Observação não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você só pode editar as próprias observações');
      res.json({ success: true, data: resultado.observacao });
    },

    async apagar(req: Request, res: Response) {
      const { id, notaId } = observacaoIdParamsSchema.parse(req.params);
      const resultado = await internalNoteService.apagar(id, notaId, req.user!.id);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Observação não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você só pode apagar as próprias observações');
      res.status(204).send();
    },
  };
}
