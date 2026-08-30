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

export async function processarFoto(buffer: Buffer): Promise<ProcessarFotoResultado> {
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    return { status: 'tipo_invalido' };
  }

  if (!metadata.format || !FORMATOS_AUTORIZADOS.has(metadata.format)) {
    return { status: 'tipo_invalido' };
  }

  const redimensionada = sharp(buffer).rotate().resize({
    width: TAMANHO_MAXIMO_PX,
    height: TAMANHO_MAXIMO_PX,
    fit: 'inside',
    withoutEnlargement: true,
  });

  let contentType: FotoProcessada['contentType'];
  let bufferFinal: Buffer;

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

  const metadataFinal = await sharp(bufferFinal).metadata();

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
