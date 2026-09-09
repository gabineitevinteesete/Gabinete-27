import type { PublicUser, UserRepository } from '../../src/repositories/user.repository.js';
import type { RefreshTokenRepository } from '../../src/repositories/refresh-token.repository.js';
import type { LoginAttemptRepository } from '../../src/repositories/login-attempt.repository.js';
import type { AuditLogRepository } from '../../src/repositories/audit-log.repository.js';
import type { UserRoleValue } from '../../src/utils/jwt.js';
import type { PhotoUploader, FotoEnviada } from '../../src/services/cloudinary-uploader.service.js';
import type { RequestTypeRepository, RequestTypeSummary } from '../../src/repositories/request-type.repository.js';
import type {
  RequestRepository,
  RequestDetail,
  CriarRequestInput,
  FotoParaSalvar,
  ListarFiltro,
  Paginacao,
} from '../../src/repositories/request.repository.js';
import { transicaoValida, TransicaoConcorrenteError, type RequestStatusValue } from '../../src/utils/request-status.js';
import { randomUUID } from 'node:crypto';
import type { InternalNoteRepository, InternalNoteItem } from '../../src/repositories/internal-note.repository.js';

type StoredUser = PublicUser & { pinHash: string | null };

export function createFakeUserRepo(seed: StoredUser[] = []): UserRepository & { users: StoredUser[] } {
  const users = [...seed];
  return {
    users,
    async findByTelefone(telefone) {
      return users.find((u) => u.telefone === telefone) ?? null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async create({ nome, telefone, role }) {
      const now = new Date();
      const user: StoredUser = {
        id: randomUUID(),
        nome,
        telefone,
        role,
        ativo: true,
        pinDefinido: false,
        pinHash: null,
        createdAt: now,
        updatedAt: now,
      };
      users.push(user);
      return user;
    },
    async setPinHash(id, pinHash) {
      const user = users.find((u) => u.id === id);
      if (user) {
        user.pinHash = pinHash;
        user.pinDefinido = true;
      }
    },
    async clearPin(id) {
      const user = users.find((u) => u.id === id);
      if (user) {
        user.pinHash = null;
        user.pinDefinido = false;
      }
    },
    async updateRole(id, role) {
      const user = users.find((u) => u.id === id)!;
      user.role = role as UserRoleValue;
      return user;
    },
    async setAtivo(id, ativo) {
      const user = users.find((u) => u.id === id)!;
      user.ativo = ativo;
      return user;
    },
    async update(id, data) {
      const user = users.find((u) => u.id === id)!;
      if (data.nome !== undefined) user.nome = data.nome;
      if (data.telefone !== undefined) user.telefone = data.telefone;
      return user;
    },
    async list(filter) {
      // Cópia rasa: sem isso o caso sem filtro devolveria o array interno por referência e
      // um caller poderia mutar o estado do fake sem passar pelos métodos do repositório.
      return filter?.ativo === undefined ? [...users] : users.filter((u) => u.ativo === filter.ativo);
    },
  };
}

export function createFakeRefreshTokenRepo(): RefreshTokenRepository & {
  tokens: { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }[];
} {
  const tokens: { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }[] = [];
  return {
    tokens,
    async create({ userId, tokenHash, expiresAt }) {
      tokens.push({ id: randomUUID(), userId, tokenHash, expiresAt, revokedAt: null });
    },
    async findValidByHash(tokenHash) {
      return tokens.find((t) => t.tokenHash === tokenHash) ?? null;
    },
    async revoke(id) {
      const token = tokens.find((t) => t.id === id);
      if (token) token.revokedAt = new Date();
    },
    async revokeAllForUser(userId) {
      for (const t of tokens) {
        if (t.userId === userId && !t.revokedAt) t.revokedAt = new Date();
      }
    },
  };
}

export function createFakeLoginAttemptRepo(): LoginAttemptRepository & {
  attempts: { telefone: string; sucesso: boolean; createdAt: Date }[];
} {
  const attempts: { telefone: string; sucesso: boolean; createdAt: Date }[] = [];
  return {
    attempts,
    async record({ telefone, sucesso }) {
      attempts.push({ telefone, sucesso, createdAt: new Date() });
    },
    async countRecentFailures(telefone, sinceMs) {
      const limite = Date.now() - sinceMs;
      return attempts.filter((a) => a.telefone === telefone && !a.sucesso && a.createdAt.getTime() >= limite).length;
    },
    async getOldestRecentFailureAt(telefone, sinceMs) {
      const limite = Date.now() - sinceMs;
      const recent = attempts.filter((a) => a.telefone === telefone && !a.sucesso && a.createdAt.getTime() >= limite);
      if (recent.length === 0) return null;
      const oldest = recent.reduce((min, a) => (a.createdAt.getTime() < min.createdAt.getTime() ? a : min));
      return oldest.createdAt;
    },
  };
}

export function createFakeAuditLogRepo(): AuditLogRepository & { records: unknown[] } {
  const records: unknown[] = [];
  return {
    records,
    async record(data) {
      records.push(data);
    },
  };
}

export function createFakePhotoUploader(): PhotoUploader & {
  uploads: { buffer: Buffer; contentType: string; folder: string }[];
} {
  const uploads: { buffer: Buffer; contentType: string; folder: string }[] = [];
  let contador = 0;
  return {
    uploads,
    async upload(input) {
      uploads.push(input);
      contador += 1;
      const resultado: FotoEnviada = {
        url: `https://res.cloudinary.com/fake/image/authenticated/v1/${input.folder}/fake-${contador}.jpg`,
        publicId: `${input.folder}/fake-${contador}`,
      };
      return resultado;
    },
    // A assinatura real do Cloudinary é exercitada no teste unitário do uploader; aqui basta
    // uma URL reconhecivelmente "assinada" para provar que a API não devolve a url do banco.
    urlAssinada(publicId) {
      return `https://res.cloudinary.com/fake/image/authenticated/s--fakesig--/${publicId}`;
    },
  };
}

export function createFakeRequestTypeRepo(
  seed: (RequestTypeSummary & { ativo: boolean })[] = [],
): RequestTypeRepository {
  const tipos = [...seed];
  return {
    async listActive() {
      return tipos
        .filter((t) => t.ativo)
        .map(({ id, nome, exigeDescricaoObrigatoria }) => ({ id, nome, exigeDescricaoObrigatoria }));
    },
    async findById(id) {
      return tipos.find((t) => t.id === id) ?? null;
    },
  };
}

interface FakeHistoricoStatus {
  requestId: string;
  statusAnterior: RequestStatusValue | null;
  statusNovo: RequestStatusValue;
  usuarioId: string;
  observacao: string | null;
  createdAt: Date;
}

interface FakeHistoricoReatribuicao {
  requestId: string;
  assessorAnteriorId: string;
  assessorNovoId: string;
  reatribuidoPorId: string;
  createdAt: Date;
}

export function createFakeRequestRepo(): RequestRepository & {
  created: { input: CriarRequestInput; fotos: FotoParaSalvar[] }[];
  historicoReatribuicao: FakeHistoricoReatribuicao[];
} {
  const created: { input: CriarRequestInput; fotos: FotoParaSalvar[] }[] = [];
  const store: RequestDetail[] = [];
  let contador = 0;
  const historicoStatus: FakeHistoricoStatus[] = [];
  const historicoReatribuicao: FakeHistoricoReatribuicao[] = [];

  return {
    created,
    historicoReatribuicao,
    async create(input, fotos) {
      created.push({ input, fotos });
      contador += 1;
      const detalhe: RequestDetail = {
        id: `fake-request-${contador}`,
        codigoInterno: input.codigoInterno,
        tituloResumido: input.tituloResumido,
        solicitanteNome: input.solicitanteNome,
        bairro: input.bairro ?? null,
        status: 'ENVIADA',
        assessorResponsavelId: input.assessorResponsavelId,
        criadoPorId: input.criadoPorId,
        assessorResponsavelNome: 'Assessor Fake',
        requestTypeId: input.requestTypeId,
        requestTypeNome: 'Tipo Fake',
        numeroProtocolo: null,
        createdAt: new Date(),
        solicitanteTelefone: input.solicitanteTelefone,
        solicitanteNascimento: input.solicitanteNascimento ?? null,
        cep: input.cep ?? null,
        rua: input.rua ?? null,
        numero: input.numero ?? null,
        complemento: input.complemento ?? null,
        cidade: input.cidade ?? null,
        estado: input.estado ?? null,
        pontoReferencia: input.pontoReferencia ?? null,
        localExato: input.localExato ?? null,
        descricao: input.descricao,
        descricaoOutroAssunto: input.descricaoOutroAssunto ?? null,
        autorizacaoDados: input.autorizacaoDados,
        updatedAt: new Date(),
        fotos: fotos.map((f, i) => ({
          id: `foto-${contador}-${i}`,
          url: f.url,
          publicId: f.publicId,
          larguraPx: f.larguraPx,
          alturaPx: f.alturaPx,
        })),
      };
      store.push(detalhe);
      return detalhe;
    },
    async findById(id) {
      return store.find((r) => r.id === id) ?? null;
    },
    async list(filtro: ListarFiltro, paginacao: Paginacao) {
      let filtrados = store;
      if (filtro.assessorResponsavelId) {
        filtrados = filtrados.filter((r) => r.assessorResponsavelId === filtro.assessorResponsavelId);
      }
      if (filtro.bairro) {
        filtrados = filtrados.filter((r) => r.bairro === filtro.bairro);
      }
      if (filtro.status) {
        filtrados = filtrados.filter((r) => r.status === filtro.status);
      }
      const total = filtrados.length;
      const inicio = (paginacao.pagina - 1) * paginacao.tamanhoPagina;
      const pagina = filtrados.slice(inicio, inicio + paginacao.tamanhoPagina);
      return { items: pagina.map(({ fotos: _fotos, ...resumo }) => resumo), total };
    },
    async update(id, input) {
      const existente = store.find((r) => r.id === id);
      if (!existente) throw new Error('Request não encontrada (fake)');
      Object.assign(existente, input);
      return existente;
    },
    async updateStatus(id, novoStatus, usuarioId, motivo) {
      const existente = store.find((r) => r.id === id);
      if (!existente) throw new Error('Request não encontrada (fake)');
      // Espelha a revalidação que o repositório real faz dentro da transação.
      if (!transicaoValida(existente.status, novoStatus)) throw new TransicaoConcorrenteError();
      historicoStatus.push({
        requestId: id,
        statusAnterior: existente.status,
        statusNovo: novoStatus,
        usuarioId,
        observacao: motivo ?? null,
        createdAt: new Date(),
      });
      existente.status = novoStatus;
      return existente;
    },
    async listarHistoricoStatus(id) {
      return historicoStatus
        .filter((h) => h.requestId === id)
        .slice()
        .reverse()
        .map((h, i) => ({
          id: `historico-${id}-${i}`,
          statusAnterior: h.statusAnterior,
          statusNovo: h.statusNovo,
          usuarioId: h.usuarioId,
          usuarioNome: 'Usuário Fake',
          observacao: h.observacao,
          createdAt: h.createdAt,
        }));
    },
    async reatribuir(id, novoAssessorId, reatribuidoPorId) {
      const existente = store.find((r) => r.id === id);
      if (!existente) throw new Error('Request não encontrada (fake)');
      historicoReatribuicao.push({
        requestId: id,
        assessorAnteriorId: existente.assessorResponsavelId,
        assessorNovoId: novoAssessorId,
        reatribuidoPorId,
        createdAt: new Date(),
      });
      existente.assessorResponsavelId = novoAssessorId;
      return existente;
    },
  };
}

export function createFakeInternalNoteRepo(): InternalNoteRepository & { store: InternalNoteItem[] } {
  const store: InternalNoteItem[] = [];
  let contador = 0;

  return {
    store,
    async create(requestId, autorId, texto) {
      contador += 1;
      const item: InternalNoteItem = {
        id: `fake-nota-${contador}`,
        requestId,
        autorId,
        autorNome: 'Autor Fake',
        texto,
        createdAt: new Date(),
        updatedAt: null,
      };
      store.push(item);
      return item;
    },
    async list(requestId) {
      return store.filter((n) => n.requestId === requestId).slice().reverse();
    },
    async findById(id) {
      return store.find((n) => n.id === id) ?? null;
    },
    async update(id, texto) {
      const existente = store.find((n) => n.id === id);
      if (!existente) throw new Error('Observação não encontrada (fake)');
      existente.texto = texto;
      existente.updatedAt = new Date();
      return existente;
    },
    async delete(id) {
      const indice = store.findIndex((n) => n.id === id);
      if (indice !== -1) store.splice(indice, 1);
    },
  };
}
