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
import { processarFoto } from './photo-processing.service.js';
import { gerarCodigoInterno } from '../utils/codigo-interno.js';
import { podeEditarComoAssessorDeRua } from '../utils/request-status.js';

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
}

export type CriarDemandaResultado =
  | { status: 'ok'; demanda: RequestDetail }
  | { status: 'tipo_invalido' }
  | { status: 'descricao_outro_obrigatoria' }
  | { status: 'quantidade_fotos_invalida' }
  | { status: 'foto_invalida'; indice: number }
  | { status: 'autorizacao_obrigatoria' };

export interface UsuarioAutenticado {
  id: string;
  role: UserRoleValue;
}

export type BuscarDemandaResultado =
  | { status: 'ok'; demanda: RequestDetail }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

export type EditarDemandaResultado =
  | { status: 'ok'; demanda: RequestDetail }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

export class RequestService {
  private requestRepo: RequestRepository;
  private requestTypeRepo: RequestTypeRepository;
  private photoUploader: PhotoUploader;

  constructor(deps: { requestRepo: RequestRepository; requestTypeRepo: RequestTypeRepository; photoUploader: PhotoUploader }) {
    this.requestRepo = deps.requestRepo;
    this.requestTypeRepo = deps.requestTypeRepo;
    this.photoUploader = deps.photoUploader;
  }

  async criar(input: CriarDemandaInput): Promise<CriarDemandaResultado> {
    if (input.fotos.length < 2 || input.fotos.length > 4) {
      return { status: 'quantidade_fotos_invalida' };
    }
    if (!input.autorizacaoDados) {
      return { status: 'autorizacao_obrigatoria' };
    }

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

    const demanda = await this.requestRepo.create(
      {
        codigoInterno: gerarCodigoInterno(),
        solicitanteNome: input.solicitanteNome,
        solicitanteTelefone: input.solicitanteTelefone,
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
        autorizacaoDados: input.autorizacaoDados,
      },
      fotosEnviadas,
    );

    return { status: 'ok', demanda };
  }

  async listar(
    filtro: ListarFiltro,
    paginacao: Paginacao,
    usuario: UsuarioAutenticado,
  ): Promise<{ items: RequestSummary[]; total: number }> {
    const filtroEfetivo: ListarFiltro =
      usuario.role === 'ASSESSOR_RUA' ? { ...filtro, assessorResponsavelId: usuario.id } : filtro;
    return this.requestRepo.list(filtroEfetivo, paginacao);
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado): Promise<BuscarDemandaResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };
    if (usuario.role === 'ASSESSOR_RUA' && demanda.assessorResponsavelId !== usuario.id) {
      return { status: 'sem_permissao' };
    }
    return { status: 'ok', demanda };
  }

  async editar(id: string, input: EditarRequestInput, usuario: UsuarioAutenticado): Promise<EditarDemandaResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };

    if (usuario.role === 'ASSESSOR_RUA') {
      const dono = demanda.assessorResponsavelId === usuario.id;
      const aindaEditavel = podeEditarComoAssessorDeRua(demanda.status);
      if (!dono || !aindaEditavel) {
        return { status: 'sem_permissao' };
      }
    }

    const atualizado = await this.requestRepo.update(id, input);
    return { status: 'ok', demanda: atualizado };
  }
}
