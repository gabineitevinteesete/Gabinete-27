import type {
  RequestRepository,
  RequestDetail,
  RequestSummary,
  ListarFiltro,
  Paginacao,
  EditarRequestInput,
} from '../repositories/request.repository.js';
import type { RequestTypeRepository } from '../repositories/request-type.repository.js';
import type { PhotoUploader } from './cloudinary-uploader.service.js';
import type { UserRoleValue } from '../utils/jwt.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { HistoricoStatusItem } from '../repositories/request.repository.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';
import { processarFoto } from './photo-processing.service.js';
import { gerarCodigoInterno } from '../utils/codigo-interno.js';
import { gerarCsv } from '../utils/csv.js';
import {
  transicaoValida,
  exigeMotivo,
  podeEditarComoAssessorDeRua,
  STATUS_ROTULO,
  TransicaoConcorrenteError,
  type RequestStatusValue,
} from '../utils/request-status.js';
import { isValidBrazilianPhone, normalizePhone } from '../utils/phone.js';

/** Foto como é servida à API: `url` é sempre assinada na hora, nunca a `url` pública guardada no banco. */
export interface FotoPublica {
  id: string;
  url: string;
  larguraPx: number | null;
  alturaPx: number | null;
}

export type DemandaDetalhe = Omit<RequestDetail, 'fotos'> & { fotos: FotoPublica[] };

export interface CriarDemandaInput {
  solicitanteNome: string;
  solicitanteTelefone: string;
  solicitanteNascimento?: Date;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  pontoReferencia?: string;
  localExato: string;
  tituloResumido: string;
  descricao: string;
  descricaoOutroAssunto?: string;
  requestTypeId: string;
  autorizacaoDados: boolean;
  assessorResponsavelId: string;
  fotos: Buffer[];
  ip?: string;
  /** UUID do envio (cabeçalho Idempotency-Key); permite reconhecer um reenvio. */
  idempotencyKey?: string;
}

export type CriarDemandaResultado =
  | { status: 'ok'; demanda: DemandaDetalhe }
  | { status: 'tipo_invalido' }
  | { status: 'descricao_outro_obrigatoria' }
  | { status: 'telefone_invalido' }
  | { status: 'quantidade_fotos_invalida' }
  | { status: 'foto_invalida'; indice: number }
  | { status: 'autorizacao_obrigatoria' };

export const LIMITE_EXPORTACAO = 5000;

const CABECALHO_EXPORTACAO = ['Código', 'Título', 'Tipo', 'Status', 'Bairro', 'Solicitante', 'Assessor responsável', 'Criada em'];

const formatarDataBr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });

export type ExportarDemandasResultado =
  | { status: 'ok'; csv: string; quantidade: number }
  | { status: 'limite_excedido'; total: number };

export interface UsuarioAutenticado {
  id: string;
  role: UserRoleValue;
}

export type BuscarDemandaResultado =
  | { status: 'ok'; demanda: DemandaDetalhe }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

export type EditarDemandaResultado =
  | { status: 'ok'; demanda: DemandaDetalhe }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' }
  | { status: 'tipo_invalido' }
  | { status: 'descricao_outro_obrigatoria' }
  | { status: 'telefone_invalido' };

export type MudarStatusResultado =
  | { status: 'ok'; demanda: DemandaDetalhe }
  | { status: 'nao_encontrada' }
  | { status: 'transicao_invalida' }
  | { status: 'motivo_obrigatorio' };

export type ReatribuirResultado =
  | { status: 'ok'; demanda: DemandaDetalhe }
  | { status: 'nao_encontrada' }
  | { status: 'assessor_invalido' };

export type HistoricoStatusResultado =
  | { status: 'ok'; historico: HistoricoStatusItem[] }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

export type AnonimizarResultado = { status: 'ok' } | { status: 'nao_encontrada' };

export class RequestService {
  private requestRepo: RequestRepository;
  private requestTypeRepo: RequestTypeRepository;
  private photoUploader: PhotoUploader;
  private userRepo: UserRepository;
  private auditLogRepo: AuditLogRepository;

  constructor(deps: {
    requestRepo: RequestRepository;
    requestTypeRepo: RequestTypeRepository;
    photoUploader: PhotoUploader;
    userRepo: UserRepository;
    auditLogRepo: AuditLogRepository;
  }) {
    this.requestRepo = deps.requestRepo;
    this.requestTypeRepo = deps.requestTypeRepo;
    this.photoUploader = deps.photoUploader;
    this.userRepo = deps.userRepo;
    this.auditLogRepo = deps.auditLogRepo;
  }

  /**
   * Troca a `url` guardada no banco (privada, `type: 'authenticated'`) por uma URL assinada
   * na hora, e não expõe o `publicId`. Toda leitura de demanda passa por aqui.
   */
  private comFotosAssinadas(demanda: RequestDetail): DemandaDetalhe {
    return {
      ...demanda,
      fotos: demanda.fotos.map((foto) => ({
        id: foto.id,
        url: this.photoUploader.urlAssinada(foto.publicId),
        larguraPx: foto.larguraPx,
        alturaPx: foto.alturaPx,
      })),
    };
  }

  async criar(input: CriarDemandaInput): Promise<CriarDemandaResultado> {
    // Reenvio de um envio que já deu certo (resposta perdida, fila offline): devolve a demanda
    // existente sem refazer nada — sem processar fotos, sem subir ao Cloudinary, sem nova auditoria.
    if (input.idempotencyKey) {
      const existente = await this.requestRepo.findByIdempotencyKey(input.assessorResponsavelId, input.idempotencyKey);
      if (existente) return { status: 'ok', demanda: this.comFotosAssinadas(existente) };
    }

    if (input.fotos.length < 2 || input.fotos.length > 4) {
      return { status: 'quantidade_fotos_invalida' };
    }
    if (!input.autorizacaoDados) {
      return { status: 'autorizacao_obrigatoria' };
    }
    // Mesmo tratamento de `User.telefone` (Fase 1): valida e normaliza para E.164 antes de
    // persistir, senão o filtro por telefone exato em `list()` nunca casa.
    if (!isValidBrazilianPhone(input.solicitanteTelefone)) {
      return { status: 'telefone_invalido' };
    }
    const solicitanteTelefone = normalizePhone(input.solicitanteTelefone);

    const tipo = await this.requestTypeRepo.findById(input.requestTypeId);
    if (!tipo || !tipo.ativo) {
      return { status: 'tipo_invalido' };
    }
    if (tipo.exigeDescricaoObrigatoria && !input.descricaoOutroAssunto?.trim()) {
      return { status: 'descricao_outro_obrigatoria' };
    }

    const fotosProcessadas: { buffer: Buffer; contentType: string; larguraPx: number; alturaPx: number; bytes: number }[] = [];
    for (let indice = 0; indice < input.fotos.length; indice++) {
      const buffer = input.fotos[indice]!;
      const resultado = await processarFoto(buffer);
      if (resultado.status === 'tipo_invalido') {
        return { status: 'foto_invalida', indice };
      }
      fotosProcessadas.push(resultado.foto);
    }

    const fotosEnviadas: { url: string; publicId: string; larguraPx: number; alturaPx: number; bytes: number }[] = [];
    for (const foto of fotosProcessadas) {
      const enviada = await this.photoUploader.upload({
        buffer: foto.buffer,
        contentType: foto.contentType,
        folder: 'demandas',
      });
      fotosEnviadas.push({
        url: enviada.url,
        publicId: enviada.publicId,
        larguraPx: foto.larguraPx,
        alturaPx: foto.alturaPx,
        bytes: foto.bytes,
      });
    }

    let demanda: RequestDetail;
    try {
      demanda = await this.requestRepo.create(
        {
          codigoInterno: gerarCodigoInterno(),
          solicitanteNome: input.solicitanteNome,
          solicitanteTelefone,
          solicitanteNascimento: input.solicitanteNascimento,
          cep: input.cep,
          rua: input.rua,
          numero: input.numero,
          complemento: input.complemento,
          bairro: input.bairro,
          cidade: input.cidade,
          estado: input.estado,
          pontoReferencia: input.pontoReferencia,
          localExato: input.localExato,
          tituloResumido: input.tituloResumido,
          descricao: input.descricao,
          descricaoOutroAssunto: input.descricaoOutroAssunto,
          requestTypeId: input.requestTypeId,
          assessorResponsavelId: input.assessorResponsavelId,
          criadoPorId: input.assessorResponsavelId,
          autorizacaoDados: input.autorizacaoDados,
          idempotencyKey: input.idempotencyKey,
        },
        fotosEnviadas,
      );
    } catch (err) {
      // Dois envios simultâneos com a mesma chave: o índice único barrou o segundo. Apaga as fotos
      // que ele acabou de subir (melhor esforço) e devolve a demanda gravada pelo primeiro.
      if (input.idempotencyKey && (err as { code?: string }).code === 'P2002') {
        const existente = await this.requestRepo.findByIdempotencyKey(input.assessorResponsavelId, input.idempotencyKey);
        if (existente) {
          for (const foto of fotosEnviadas) {
            await this.photoUploader.delete(foto.publicId).catch(() => {});
          }
          return { status: 'ok', demanda: this.comFotosAssinadas(existente) };
        }
      }
      throw err;
    }

    await this.auditLogRepo.record({
      actorUserId: input.assessorResponsavelId,
      acao: 'CRIAR_DEMANDA',
      entidade: 'Request',
      entidadeId: demanda.id,
      ip: input.ip,
    });

    return { status: 'ok', demanda: this.comFotosAssinadas(demanda) };
  }

  async listar(
    filtro: ListarFiltro,
    paginacao: Paginacao,
    usuario: UsuarioAutenticado,
  ): Promise<{ items: RequestSummary[]; total: number }> {
    // O telefone gravado no banco está sempre normalizado (E.164) — sem normalizar o filtro
    // aqui também, uma busca por "(34) 99999-1234" nunca bateria contra "+5534999991234".
    const filtroComTelefoneNormalizado: ListarFiltro = filtro.solicitanteTelefone
      ? { ...filtro, solicitanteTelefone: normalizePhone(filtro.solicitanteTelefone) }
      : filtro;
    const filtroEfetivo: ListarFiltro =
      usuario.role === 'ASSESSOR_RUA'
        ? { ...filtroComTelefoneNormalizado, assessorResponsavelId: usuario.id }
        : filtroComTelefoneNormalizado;
    return this.requestRepo.list(filtroEfetivo, paginacao);
  }

  // Só o chefe chega aqui (a rota exige o papel). Telefone, endereço e descrição ficam de fora
  // de propósito: a planilha sai do sistema, então leva só o mínimo para uso gerencial.
  async exportar(
    filtro: ListarFiltro,
    atorId: string,
    ip?: string,
    limite = LIMITE_EXPORTACAO,
  ): Promise<ExportarDemandasResultado> {
    const { items, total } = await this.listar(
      filtro,
      { pagina: 1, tamanhoPagina: limite },
      { id: atorId, role: 'CHEFE' },
    );
    if (total > limite) return { status: 'limite_excedido', total };

    const csv = gerarCsv(
      CABECALHO_EXPORTACAO,
      items.map((d) => [
        d.codigoInterno,
        d.tituloResumido,
        d.requestTypeNome,
        STATUS_ROTULO[d.status],
        d.bairro ?? '',
        d.solicitanteNome,
        d.assessorResponsavelNome,
        formatarDataBr.format(d.createdAt),
      ]),
    );

    // Os filtros não vão para detalhes: podem conter o nome de um cidadão.
    await this.auditLogRepo.record({
      actorUserId: atorId,
      acao: 'EXPORTAR_DEMANDAS',
      entidade: 'Request',
      detalhes: { quantidade: items.length },
      ip,
    });

    return { status: 'ok', csv, quantidade: items.length };
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado): Promise<BuscarDemandaResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };
    if (usuario.role === 'ASSESSOR_RUA' && demanda.assessorResponsavelId !== usuario.id) {
      return { status: 'sem_permissao' };
    }
    return { status: 'ok', demanda: this.comFotosAssinadas(demanda) };
  }

  async editar(
    id: string,
    input: EditarRequestInput,
    usuario: UsuarioAutenticado,
    ip?: string,
  ): Promise<EditarDemandaResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };

    if (usuario.role === 'ASSESSOR_RUA') {
      const dono = demanda.assessorResponsavelId === usuario.id;
      const aindaEditavel = podeEditarComoAssessorDeRua(demanda.status);
      if (!dono || !aindaEditavel) {
        return { status: 'sem_permissao' };
      }
    }

    const dados: EditarRequestInput = { ...input };

    if (input.solicitanteTelefone !== undefined) {
      if (!isValidBrazilianPhone(input.solicitanteTelefone)) {
        return { status: 'telefone_invalido' };
      }
      dados.solicitanteTelefone = normalizePhone(input.solicitanteTelefone);
    }

    // A regra "Outros exige descrição" precisa ser reavaliada tanto ao trocar o tipo quanto
    // ao mexer só na descrição — senão um PATCH com `{descricaoOutroAssunto: ''}` numa
    // demanda que já é "Outros" apagaria a descrição sem passar por validação nenhuma.
    if (input.requestTypeId !== undefined || input.descricaoOutroAssunto !== undefined) {
      const tipo = await this.requestTypeRepo.findById(input.requestTypeId ?? demanda.requestTypeId);
      // Tipo inativo/inexistente só é erro quando é o tipo *novo*: não bloqueamos a edição de
      // uma demanda antiga cujo tipo foi desativado depois.
      if (input.requestTypeId !== undefined && (!tipo || !tipo.ativo)) {
        return { status: 'tipo_invalido' };
      }
      const descricaoEfetiva =
        input.descricaoOutroAssunto !== undefined ? input.descricaoOutroAssunto : demanda.descricaoOutroAssunto;
      if (tipo?.exigeDescricaoObrigatoria && !descricaoEfetiva?.trim()) {
        return { status: 'descricao_outro_obrigatoria' };
      }
    }

    const atualizado = await this.requestRepo.update(id, dados);

    await this.auditLogRepo.record({
      actorUserId: usuario.id,
      acao: 'EDITAR_DEMANDA',
      entidade: 'Request',
      entidadeId: id,
      ip,
    });

    return { status: 'ok', demanda: this.comFotosAssinadas(atualizado) };
  }

  async mudarStatus(
    id: string,
    novoStatus: RequestStatusValue,
    motivo: string | undefined,
    usuarioId: string,
  ): Promise<MudarStatusResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };
    if (!transicaoValida(demanda.status, novoStatus)) return { status: 'transicao_invalida' };
    if (exigeMotivo(novoStatus) && !motivo?.trim()) return { status: 'motivo_obrigatorio' };

    try {
      const atualizado = await this.requestRepo.updateStatus(id, novoStatus, usuarioId, motivo);
      return { status: 'ok', demanda: this.comFotosAssinadas(atualizado) };
    } catch (erro) {
      // Perdeu a corrida para outra requisição concorrente: para quem chamou é o mesmo caso
      // de uma transição inválida (a origem que ele viu não é mais o status atual).
      if (erro instanceof TransicaoConcorrenteError) return { status: 'transicao_invalida' };
      throw erro;
    }
  }

  async listarHistoricoStatus(id: string, usuario: UsuarioAutenticado): Promise<HistoricoStatusResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };
    if (usuario.role === 'ASSESSOR_RUA' && demanda.assessorResponsavelId !== usuario.id) {
      return { status: 'sem_permissao' };
    }
    const historico = await this.requestRepo.listarHistoricoStatus(id);
    return { status: 'ok', historico };
  }

  async reatribuir(id: string, novoAssessorId: string, reatribuidoPorId: string): Promise<ReatribuirResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };

    // Só assessor ativo é destino válido — o chefe não entra na fila de responsáveis.
    const novoAssessor = await this.userRepo.findById(novoAssessorId);
    if (!novoAssessor || !novoAssessor.ativo || novoAssessor.role === 'CHEFE') {
      return { status: 'assessor_invalido' };
    }

    // Reatribuir para quem já é o responsável é no-op: gravar aqui só sujaria a auditoria
    // com uma linha "de X para X".
    if (demanda.assessorResponsavelId === novoAssessorId) {
      return { status: 'ok', demanda: this.comFotosAssinadas(demanda) };
    }

    const atualizado = await this.requestRepo.reatribuir(id, novoAssessorId, reatribuidoPorId);
    return { status: 'ok', demanda: this.comFotosAssinadas(atualizado) };
  }

  async anonimizar(id: string, atorId: string, ip?: string): Promise<AnonimizarResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };

    const { publicIds } = await this.requestRepo.anonimizar(id);
    for (const publicId of publicIds) {
      await this.photoUploader.delete(publicId);
    }

    await this.auditLogRepo.record({
      actorUserId: atorId,
      acao: 'ANONIMIZAR_DEMANDA',
      entidade: 'Request',
      entidadeId: id,
      ip,
    });

    return { status: 'ok' };
  }
}
