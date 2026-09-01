import type { RequestRepository, RequestDetail } from '../repositories/request.repository.js';
import type { RequestTypeRepository } from '../repositories/request-type.repository.js';
import type { PhotoUploader } from './cloudinary-uploader.service.js';
import { processarFoto } from './photo-processing.service.js';
import { gerarCodigoInterno } from '../utils/codigo-interno.js';

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
}
