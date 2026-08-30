import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';

export interface FotoEnviada {
  url: string;
  publicId: string;
}

export interface PhotoUploader {
  upload(input: { buffer: Buffer; contentType: string; folder: string }): Promise<FotoEnviada>;
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
          { folder, resource_type: 'image' },
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
  };
}
