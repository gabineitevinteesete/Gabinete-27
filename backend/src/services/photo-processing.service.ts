import sharp, { type Metadata } from 'sharp';

export interface FotoProcessada {
  buffer: Buffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  larguraPx: number;
  alturaPx: number;
  bytes: number;
}

export type ProcessarFotoResultado =
  | { status: 'ok'; foto: FotoProcessada }
  | { status: 'tipo_invalido' };

const TAMANHO_MAXIMO_PX = 2000;
const FORMATOS_AUTORIZADOS = new Set(['jpeg', 'png', 'webp']);

/**
 * Teto de pixels decodificados por imagem (~50 MP, folgado para qualquer câmera de celular).
 * Sem isso, um arquivo pequeno que declara dimensões enormes ("bomba de descompressão")
 * força o libvips a alocar centenas de MB de memória nativa a partir de qualquer usuário
 * autenticado. O sharp levanta "Input image exceeds pixel limit" já no `metadata()`, e o
 * tratamos como qualquer outra foto inválida (400), nunca como 500.
 */
const LIMITE_PIXELS_ENTRADA = 50_000_000;
const OPCOES_SHARP = { limitInputPixels: LIMITE_PIXELS_ENTRADA } as const;

export async function processarFoto(buffer: Buffer): Promise<ProcessarFotoResultado> {
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, OPCOES_SHARP).metadata();
  } catch {
    return { status: 'tipo_invalido' };
  }

  if (!metadata.format || !FORMATOS_AUTORIZADOS.has(metadata.format)) {
    return { status: 'tipo_invalido' };
  }

  let contentType: FotoProcessada['contentType'];
  let bufferFinal: Buffer;
  let metadataFinal: Metadata;

  try {
    const redimensionada = sharp(buffer, OPCOES_SHARP).rotate().resize({
      width: TAMANHO_MAXIMO_PX,
      height: TAMANHO_MAXIMO_PX,
      fit: 'inside',
      withoutEnlargement: true,
    });

    if (metadata.format === 'jpeg') {
      contentType = 'image/jpeg';
      bufferFinal = await redimensionada.jpeg({ quality: 85 }).toBuffer();
    } else if (metadata.format === 'png') {
      contentType = 'image/png';
      bufferFinal = await redimensionada.png().toBuffer();
    } else {
      contentType = 'image/webp';
      bufferFinal = await redimensionada.webp({ quality: 85 }).toBuffer();
    }

    metadataFinal = await sharp(bufferFinal, OPCOES_SHARP).metadata();
  } catch {
    // Decodificação recusada (limite de pixels) ou arquivo corrompido além do cabeçalho:
    // mesmo desfecho de qualquer foto inválida.
    return { status: 'tipo_invalido' };
  }

  return {
    status: 'ok',
    foto: {
      buffer: bufferFinal,
      contentType,
      larguraPx: metadataFinal.width ?? 0,
      alturaPx: metadataFinal.height ?? 0,
      bytes: bufferFinal.length,
    },
  };
}
