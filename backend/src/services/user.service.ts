import type { UserRepository, PublicUser } from '../repositories/user.repository.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';
import type { UserRoleValue } from '../utils/jwt.js';
import { isValidBrazilianPhone, normalizePhone } from '../utils/phone.js';

export type CriarAssessorResult =
  | { status: 'ok'; user: PublicUser }
  | { status: 'telefone_invalido' }
  | { status: 'telefone_duplicado' };

// `ultimo_chefe`: a alteração deixaria o gabinete sem nenhum CHEFE ativo, sem caminho de
// recuperação pela própria aplicação.
export type AlterarUsuarioResult = { status: 'ok'; user: PublicUser } | { status: 'ultimo_chefe' };

export type EditarAssessorResult =
  | { status: 'ok'; user: PublicUser }
  | { status: 'telefone_invalido' }
  | { status: 'telefone_duplicado' };

export class UserService {
  private userRepo: UserRepository;
  private auditLogRepo: AuditLogRepository;

  constructor(deps: { userRepo: UserRepository; auditLogRepo: AuditLogRepository }) {
    this.userRepo = deps.userRepo;
    this.auditLogRepo = deps.auditLogRepo;
  }

  /**
   * Retorna true se `userId` é hoje o único CHEFE ativo — ou seja, se removê-lo do papel
   * (por desativação ou troca de papel) deixaria o gabinete sem nenhum chefe.
   * Na escala deste sistema (dezenas de usuários) filtrar a lista em memória é suficiente;
   * não vale uma query de contagem dedicada.
   */
  private async ehUltimoChefeAtivo(userId: string): Promise<boolean> {
    const ativos = await this.userRepo.list({ ativo: true });
    const chefesAtivos = ativos.filter((u) => u.role === 'CHEFE');
    return chefesAtivos.length === 1 && chefesAtivos[0]?.id === userId;
  }

  async criarAssessor(input: {
    nome: string;
    telefone: string;
    role: UserRoleValue;
    criadoPorId: string;
    ip?: string;
  }): Promise<CriarAssessorResult> {
    if (!isValidBrazilianPhone(input.telefone)) {
      return { status: 'telefone_invalido' };
    }

    const telefoneNormalizado = normalizePhone(input.telefone);
    const existente = await this.userRepo.findByTelefone(telefoneNormalizado);
    if (existente) {
      return { status: 'telefone_duplicado' };
    }

    const user = await this.userRepo.create({ nome: input.nome, telefone: telefoneNormalizado, role: input.role });

    await this.auditLogRepo.record({
      actorUserId: input.criadoPorId,
      acao: 'CRIAR_USUARIO',
      entidade: 'User',
      entidadeId: user.id,
      detalhes: { role: input.role },
      ip: input.ip,
    });

    return { status: 'ok', user };
  }

  async editarAssessor(input: {
    userId: string;
    nome?: string;
    telefone?: string;
    atualizadoPorId: string;
    ip?: string;
  }): Promise<EditarAssessorResult> {
    let telefoneNormalizado: string | undefined;
    if (input.telefone !== undefined) {
      if (!isValidBrazilianPhone(input.telefone)) {
        return { status: 'telefone_invalido' };
      }
      telefoneNormalizado = normalizePhone(input.telefone);
      const existente = await this.userRepo.findByTelefone(telefoneNormalizado);
      if (existente && existente.id !== input.userId) {
        return { status: 'telefone_duplicado' };
      }
    }

    const user = await this.userRepo.update(input.userId, {
      nome: input.nome,
      telefone: telefoneNormalizado,
    });

    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: 'EDITAR_USUARIO',
      entidade: 'User',
      entidadeId: input.userId,
      ip: input.ip,
    });

    return { status: 'ok', user };
  }

  async listar(filter?: { ativo?: boolean; role?: UserRoleValue }): Promise<PublicUser[]> {
    return this.userRepo.list(filter);
  }

  async atualizarRole(input: {
    userId: string;
    novoRole: UserRoleValue;
    atualizadoPorId: string;
    ip?: string;
  }): Promise<AlterarUsuarioResult> {
    if (input.novoRole !== 'CHEFE' && (await this.ehUltimoChefeAtivo(input.userId))) {
      return { status: 'ultimo_chefe' };
    }

    const user = await this.userRepo.updateRole(input.userId, input.novoRole);
    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: 'ATUALIZAR_ROLE',
      entidade: 'User',
      entidadeId: input.userId,
      detalhes: { novoRole: input.novoRole },
      ip: input.ip,
    });
    return { status: 'ok', user };
  }

  async definirAtivo(input: {
    userId: string;
    ativo: boolean;
    atualizadoPorId: string;
    ip?: string;
  }): Promise<AlterarUsuarioResult> {
    if (!input.ativo && (await this.ehUltimoChefeAtivo(input.userId))) {
      return { status: 'ultimo_chefe' };
    }

    const user = await this.userRepo.setAtivo(input.userId, input.ativo);
    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: input.ativo ? 'ATIVAR_USUARIO' : 'DESATIVAR_USUARIO',
      entidade: 'User',
      entidadeId: input.userId,
      ip: input.ip,
    });
    return { status: 'ok', user };
  }
}
