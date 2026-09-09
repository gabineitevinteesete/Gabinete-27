import type { DutyRosterRepository, AtribuicaoEscala, LocalEscalaValue } from '../repositories/duty-roster.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';

export type SubstituirDiaResult = { status: 'ok' } | { status: 'usuario_invalido'; userId: string };

export class DutyRosterService {
  private dutyRosterRepo: DutyRosterRepository;
  private userRepo: UserRepository;

  constructor(deps: { dutyRosterRepo: DutyRosterRepository; userRepo: UserRepository }) {
    this.dutyRosterRepo = deps.dutyRosterRepo;
    this.userRepo = deps.userRepo;
  }

  async listarMes(mes?: string): Promise<Record<string, AtribuicaoEscala[]>> {
    const referencia = mes ? new Date(`${mes}-01T00:00:00.000Z`) : new Date();
    const mesInicio = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), 1));
    const mesFim = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + 1, 1));
    return this.dutyRosterRepo.listarMes(mesInicio, mesFim);
  }

  async substituirDia(
    dataStr: string,
    atribuicoes: { userId: string; local: LocalEscalaValue }[],
  ): Promise<SubstituirDiaResult> {
    for (const atribuicao of atribuicoes) {
      const usuario = await this.userRepo.findById(atribuicao.userId);
      if (!usuario || usuario.role === 'CHEFE' || !usuario.ativo) {
        return { status: 'usuario_invalido', userId: atribuicao.userId };
      }
    }

    const data = new Date(`${dataStr}T00:00:00.000Z`);
    await this.dutyRosterRepo.substituirDia(data, atribuicoes);
    return { status: 'ok' };
  }
}
