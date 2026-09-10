import type { RequestTypeRepository, RequestTypeSummary } from '../repositories/request-type.repository.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';

export type RequestTypeAdmin = RequestTypeSummary & { ativo: boolean };

export type CriarTipoResult = { status: 'ok'; tipo: RequestTypeAdmin } | { status: 'nome_duplicado' };

export type EditarTipoResult =
  | { status: 'ok'; tipo: RequestTypeAdmin }
  | { status: 'nome_duplicado' }
  | { status: 'nao_encontrado' };

export type DefinirAtivoTipoResult = { status: 'ok'; tipo: RequestTypeAdmin } | { status: 'nao_encontrado' };

export class RequestTypeService {
  private requestTypeRepo: RequestTypeRepository;
  private auditLogRepo: AuditLogRepository;

  constructor(deps: { requestTypeRepo: RequestTypeRepository; auditLogRepo: AuditLogRepository }) {
    this.requestTypeRepo = deps.requestTypeRepo;
    this.auditLogRepo = deps.auditLogRepo;
  }

  async listarAtivos(): Promise<RequestTypeSummary[]> {
    return this.requestTypeRepo.listActive();
  }

  async listarTodos(): Promise<RequestTypeAdmin[]> {
    return this.requestTypeRepo.listAll();
  }

  async criar(input: {
    nome: string;
    exigeDescricaoObrigatoria: boolean;
    criadoPorId: string;
    ip?: string;
  }): Promise<CriarTipoResult> {
    const existente = await this.requestTypeRepo.findByNome(input.nome);
    if (existente) {
      return { status: 'nome_duplicado' };
    }

    const tipo = await this.requestTypeRepo.create({
      nome: input.nome,
      exigeDescricaoObrigatoria: input.exigeDescricaoObrigatoria,
    });

    await this.auditLogRepo.record({
      actorUserId: input.criadoPorId,
      acao: 'CRIAR_TIPO_DEMANDA',
      entidade: 'RequestType',
      entidadeId: tipo.id,
      ip: input.ip,
    });

    return { status: 'ok', tipo };
  }

  async editar(input: {
    tipoId: string;
    nome?: string;
    exigeDescricaoObrigatoria?: boolean;
    atualizadoPorId: string;
    ip?: string;
  }): Promise<EditarTipoResult> {
    const atual = await this.requestTypeRepo.findById(input.tipoId);
    if (!atual) {
      return { status: 'nao_encontrado' };
    }

    if (input.nome !== undefined) {
      const existente = await this.requestTypeRepo.findByNome(input.nome);
      if (existente && existente.id !== input.tipoId) {
        return { status: 'nome_duplicado' };
      }
    }

    const tipo = await this.requestTypeRepo.update(input.tipoId, {
      nome: input.nome,
      exigeDescricaoObrigatoria: input.exigeDescricaoObrigatoria,
    });

    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: 'EDITAR_TIPO_DEMANDA',
      entidade: 'RequestType',
      entidadeId: input.tipoId,
      ip: input.ip,
    });

    return { status: 'ok', tipo };
  }

  async definirAtivo(input: {
    tipoId: string;
    ativo: boolean;
    atualizadoPorId: string;
    ip?: string;
  }): Promise<DefinirAtivoTipoResult> {
    const atual = await this.requestTypeRepo.findById(input.tipoId);
    if (!atual) {
      return { status: 'nao_encontrado' };
    }

    const tipo = await this.requestTypeRepo.setAtivo(input.tipoId, input.ativo);

    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: input.ativo ? 'ATIVAR_TIPO_DEMANDA' : 'DESATIVAR_TIPO_DEMANDA',
      entidade: 'RequestType',
      entidadeId: input.tipoId,
      ip: input.ip,
    });

    return { status: 'ok', tipo };
  }
}
