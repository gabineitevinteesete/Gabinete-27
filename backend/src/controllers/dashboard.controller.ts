import type { Request, Response } from 'express';
import type { DashboardService } from '../services/dashboard.service.js';
import { HttpError } from '../middlewares/error-handler.js';
import { produtividadeQuerySchema, relatorioQuerySchema } from '../validators/dashboard.validators.js';

export function createDashboardController(dashboardService: DashboardService) {
  return {
    async resumo(_req: Request, res: Response) {
      const resumo = await dashboardService.resumo();
      res.json({ success: true, data: resumo });
    },

    async relatorio(req: Request, res: Response) {
      const parametros = relatorioQuerySchema.safeParse(req.query);
      if (!parametros.success) {
        // Só a mensagem, já em português (o formato padrão do ZodError prefixaria o nome do campo).
        throw new HttpError(400, parametros.error.issues[0]!.message);
      }
      const resultado = await dashboardService.relatorio(parametros.data.de, parametros.data.ate);
      res.json({ success: true, data: resultado });
    },

    async produtividadeAssessores(req: Request, res: Response) {
      const { mes } = produtividadeQuerySchema.parse(req.query);
      const resultado = await dashboardService.produtividadeAssessores(mes);
      res.json({ success: true, data: resultado });
    },
  };
}
