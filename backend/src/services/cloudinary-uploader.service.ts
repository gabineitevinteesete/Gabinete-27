import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';

export interface FotoEnviada {
  url: string;
  publicId: string;
}

export interface PhotoUploader {
  upload(input: { buffer: Buffer; contentType: string; folder: string }): Promise<FotoEnviada>;
  /**
   * URL de entrega assinada para um `publicId` já armazenado. As fotos são enviadas como
   * `type: 'authenticated'`, então a URL pública não existe — só quem tem a assinatura acessa.
   * A assinatura do Cloudinary NÃO expira sozinha (a API `cloudinary.url()` não suporta
   * expiração em URLs de entrega — isso exigiria o recurso pago "token-based authentication").
   * Não guarde o retorno em lugar persistente: ele é gerado a cada leitura da API para não
   * depender de um valor antigo, mas o link em si continua válido se vazar.
   */
  urlAssinada(publicId: string): string;
}

export function createCloudinaryUploader(config: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}): PhotoUploader {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  return {
    upload({ buffer, folder }) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          // `type: 'authenticated'` (em vez do padrão 'upload'): são fotos ligadas a nome e
          // endereço de cidadãos, atrás de um consentimento explícito — não podem ficar
          // acessíveis a quem tiver a URL.
          { folder, resource_type: 'image', type: 'authenticated' },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error('Falha ao enviar imagem ao Cloudinary'));
              return;
            }
            resolve({ url: result.secure_url, publicId: result.public_id });
          },
        );
        Readable.from(buffer).pipe(stream);
      });
    },

    urlAssinada(publicId) {
      return cloudinary.url(publicId, {
        type: 'authenticated',
        resource_type: 'image',
        sign_url: true,
        secure: true,
      });
    },
  };
}
