import type { DashboardRepository, ResumoDashboard, ProdutividadeAssessor } from '../repositories/dashboard.repository.js';

export class DashboardService {
  private dashboardRepo: DashboardRepository;

  constructor(deps: { dashboardRepo: DashboardRepository }) {
    this.dashboardRepo = deps.dashboardRepo;
  }

  async resumo(): Promise<ResumoDashboard> {
    return this.dashboardRepo.resumo();
  }

  /** `mes` no formato "YYYY-MM"; sem valor, usa o mês corrente. */
  async produtividadeAssessores(mes?: string): Promise<ProdutividadeAssessor[]> {
    const referencia = mes ? new Date(`${mes}-01T00:00:00.000Z`) : new Date();
    const mesInicio = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), 1));
    const mesFim = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + 1, 1));
    return this.dashboardRepo.produtividadeAssessores(mesInicio, mesFim);
  }
}
