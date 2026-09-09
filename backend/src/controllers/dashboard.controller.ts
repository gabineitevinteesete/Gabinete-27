import type { Request, Response } from 'express';
import type { DashboardService } from '../services/dashboard.service.js';
import { produtividadeQuerySchema } from '../validators/dashboard.validators.js';

export function createDashboardController(dashboardService: DashboardService) {
  return {
    async resumo(_req: Request, res: Response) {
      const resumo = await dashboardService.resumo();
      res.json({ success: true, data: resumo });
    },

    async produtividadeAssessores(req: Request, res: Response) {
      const { mes } = produtividadeQuerySchema.parse(req.query);
      const resultado = await dashboardService.produtividadeAssessores(mes);
      res.json({ success: true, data: resultado });
    },
  };
}
