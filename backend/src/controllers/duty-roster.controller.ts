import type { Request, Response } from 'express';
import type { DutyRosterService } from '../services/duty-roster.service.js';
import { mesQuerySchema, dataParamsSchema, substituirDiaSchema } from '../validators/duty-roster.validators.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createDutyRosterController(dutyRosterService: DutyRosterService) {
  return {
    async listarMes(req: Request, res: Response) {
      const { mes } = mesQuerySchema.parse(req.query);
      const dias = await dutyRosterService.listarMes(mes);
      res.json({ success: true, data: { dias } });
    },

    async substituirDia(req: Request, res: Response) {
      const { data } = dataParamsSchema.parse(req.params);
      const { atribuicoes } = substituirDiaSchema.parse(req.body);
      const result = await dutyRosterService.substituirDia(data, atribuicoes);
      if (result.status === 'usuario_invalido') {
        throw new HttpError(400, 'Usuário inválido para escala: precisa ser um assessor ativo');
      }
      res.status(204).send();
    },
  };
}
