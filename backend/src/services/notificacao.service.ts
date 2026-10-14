import type { NotificationRepository, NotificacaoItem } from '../repositories/notification.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { STATUS_ROTULO, type RequestStatusValue } from '../utils/request-status.js';

export const LIMITE_LISTA_NOTIFICACOES = 30;

export const TIPO_NOTIFICACAO = {
  DEMANDA_NOVA: 'DEMANDA_NOVA',
  DEMANDA_REATRIBUIDA: 'DEMANDA_REATRIBUIDA',
  STATUS_ALTERADO: 'STATUS_ALTERADO',
} as const;

interface DemandaParaAviso {
  id: string;
  codigoInterno: string;
}

/**
 * Avisos dentro do app. Os textos levam SÓ o código interno e o rótulo do status: nunca nome,
 * telefone, endereço nem o motivo digitado por assessores (quem precisa do detalhe abre a demanda).
 * Ninguém é avisado da própria ação.
 */
export class NotificacaoService {
  private notificationRepo: NotificationRepository;
  private userRepo: UserRepository;

  constructor(deps: { notificationRepo: NotificationRepository; userRepo: UserRepository }) {
    this.notificationRepo = deps.notificationRepo;
    this.userRepo = deps.userRepo;
  }

  async demandaCriada(demanda: DemandaParaAviso, criadoPorId: string): Promise<void> {
    const chefes = await this.userRepo.list({ ativo: true, role: 'CHEFE' });
    // Uma única gravação para todos: o tempo da resposta não cresce com o número de chefes.
    await this.notificationRepo.createMany(
      chefes
        .filter((chefe) => chefe.id !== criadoPorId)
        .map((chefe) => ({
          userId: chefe.id,
          requestId: demanda.id,
          tipo: TIPO_NOTIFICACAO.DEMANDA_NOVA,
          mensagem: `Nova demanda ${demanda.codigoInterno} registrada.`,
        })),
    );
  }

  async demandaReatribuida(demanda: DemandaParaAviso, novoResponsavelId: string, reatribuidoPorId: string): Promise<void> {
    if (novoResponsavelId === reatribuidoPorId) return;
    await this.notificationRepo.create({
      userId: novoResponsavelId,
      requestId: demanda.id,
      tipo: TIPO_NOTIFICACAO.DEMANDA_REATRIBUIDA,
      mensagem: `Você recebeu a demanda ${demanda.codigoInterno}.`,
    });
  }

  async statusAlterado(
    demanda: DemandaParaAviso & { assessorResponsavelId: string },
    novoStatus: RequestStatusValue,
    alteradoPorId: string,
  ): Promise<void> {
    if (demanda.assessorResponsavelId === alteradoPorId) return;
    await this.notificationRepo.create({
      userId: demanda.assessorResponsavelId,
      requestId: demanda.id,
      tipo: TIPO_NOTIFICACAO.STATUS_ALTERADO,
      mensagem: `A demanda ${demanda.codigoInterno} passou para "${STATUS_ROTULO[novoStatus]}".`,
    });
  }

  listar(userId: string): Promise<{ items: NotificacaoItem[]; naoLidas: number }> {
    return this.notificationRepo.listar(userId, LIMITE_LISTA_NOTIFICACOES);
  }

  marcarLida(id: string, userId: string): Promise<boolean> {
    return this.notificationRepo.marcarLida(id, userId);
  }

  marcarTodasLidas(userId: string): Promise<void> {
    return this.notificationRepo.marcarTodasLidas(userId);
  }
}
