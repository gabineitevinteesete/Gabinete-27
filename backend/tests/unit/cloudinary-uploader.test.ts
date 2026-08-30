import { describe, it, expect, vi } from 'vitest';
import { createCloudinaryUploader } from '../../src/services/cloudinary-uploader.service.js';

vi.mock('cloudinary', () => {
  const uploadStream = vi.fn((_options: unknown, callback: (error: unknown, result: unknown) => void) => {
    const { PassThrough } = require('node:stream');
    const stream = new PassThrough();
    stream.on('end', () => {
      callback(null, { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/pasta/abc123.jpg', public_id: 'pasta/abc123' });
    });
    stream.resume();
    return stream;
  });

  return {
    v2: {
      config: vi.fn(),
      uploader: { upload_stream: uploadStream },
    },
  };
});

describe('createCloudinaryUploader', () => {
  it('resolve com a url segura e o publicId retornados pelo Cloudinary', async () => {
    const uploader = createCloudinaryUploader({ cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' });
    const resultado = await uploader.upload({
      buffer: Buffer.from('conteudo-fake-da-imagem'),
      contentType: 'image/jpeg',
      folder: 'demandas',
    });

    expect(resultado.url).toBe('https://res.cloudinary.com/demo/image/upload/v1/pasta/abc123.jpg');
    expect(resultado.publicId).toBe('pasta/abc123');
  });
});
