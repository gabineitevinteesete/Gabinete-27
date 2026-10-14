import type {
  DashboardRepository,
  ResumoDashboard,
  ProdutividadeAssessor,
  RelatorioPeriodo,
} from '../repositories/dashboard.repository.js';
import { intervaloBrasilia } from '../utils/periodo.js';

export class DashboardService {
  private dashboardRepo: DashboardRepository;

  constructor(deps: { dashboardRepo: DashboardRepository }) {
    this.dashboardRepo = deps.dashboardRepo;
  }

  async resumo(): Promise<ResumoDashboard> {
    return this.dashboardRepo.resumo();
  }

  /** `de` e `ate` no formato AAAA-MM-DD (já validados); o período é o de Brasília, os dois dias inclusos. */
  async relatorio(de: string, ate: string): Promise<RelatorioPeriodo & { de: string; ate: string }> {
    const { inicio, fimExclusivo } = intervaloBrasilia(de, ate);
    const dados = await this.dashboardRepo.relatorioPeriodo(inicio, fimExclusivo);
    return { de, ate, ...dados };
  }

  /** `mes` no formato "YYYY-MM"; sem valor, usa o mês corrente. */
  async produtividadeAssessores(mes?: string): Promise<ProdutividadeAssessor[]> {
    const referencia = mes ? new Date(`${mes}-01T00:00:00.000Z`) : new Date();
    const mesInicio = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), 1));
    const mesFim = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + 1, 1));
    return this.dashboardRepo.produtividadeAssessores(mesInicio, mesFim);
  }
}
