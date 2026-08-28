import type { UserRepository, PublicUser } from '../repositories/user.repository.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';
import type { UserRoleValue } from '../utils/jwt.js';
import { isValidBrazilianPhone, normalizePhone } from '../utils/phone.js';

export type CriarAssessorResult =
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

  async criarAssessor(input: {
    nome: string;
    telefone: string;
    role: UserRoleValue;
    criadoPorId: string;
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
    });

    return { status: 'ok', user };
  }

  async listar(filter?: { ativo?: boolean }): Promise<PublicUser[]> {
    return this.userRepo.list(filter);
  }

  async atualizarRole(input: { userId: string; novoRole: UserRoleValue; atualizadoPorId: string }): Promise<PublicUser> {
    const user = await this.userRepo.updateRole(input.userId, input.novoRole);
    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: 'ATUALIZAR_ROLE',
      entidade: 'User',
      entidadeId: input.userId,
      detalhes: { novoRole: input.novoRole },
    });
    return user;
  }

  async definirAtivo(input: { userId: string; ativo: boolean; atualizadoPorId: string }): Promise<PublicUser> {
    const user = await this.userRepo.setAtivo(input.userId, input.ativo);
    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: input.ativo ? 'ATIVAR_USUARIO' : 'DESATIVAR_USUARIO',
      entidade: 'User',
      entidadeId: input.userId,
    });
    return user;
  }
}
