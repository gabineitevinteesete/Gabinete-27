import { describe, it, expect, vi } from 'vitest';
import { createCloudinaryUploader, VALIDADE_URL_ASSINADA_SEGUNDOS } from '../../src/services/cloudinary-uploader.service.js';

vi.mock('cloudinary', () => {
  const uploadStream = vi.fn((_options: unknown, callback: (error: unknown, result: unknown) => void) => {
    const { PassThrough } = require('node:stream');
    const stream = new PassThrough();
    stream.on('end', () => {
      callback(null, { secure_url: 'https://res.cloudinary.com/demo/image/authenticated/v1/pasta/abc123.jpg', public_id: 'pasta/abc123' });
    });
    stream.resume();
    return stream;
  });

  const url = vi.fn(
    (publicId: string, options: Record<string, unknown>) =>
      `https://res.cloudinary.com/demo/image/${String(options.type)}/s--assinatura--/${publicId}`,
  );

  return {
    v2: {
      config: vi.fn(),
      url,
      uploader: { upload_stream: uploadStream },
    },
  };
});
import { v2 as cloudinary } from 'cloudinary';

describe('createCloudinaryUploader', () => {
  it('resolve com a url segura e o publicId retornados pelo Cloudinary', async () => {
    const uploader = createCloudinaryUploader({ cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' });
    const resultado = await uploader.upload({
      buffer: Buffer.from('conteudo-fake-da-imagem'),
      contentType: 'image/jpeg',
      folder: 'demandas',
    });

    expect(resultado.url).toBe('https://res.cloudinary.com/demo/image/authenticated/v1/pasta/abc123.jpg');
    expect(resultado.publicId).toBe('pasta/abc123');
  });

  it('envia as fotos como "authenticated", não com o type público padrão', async () => {
    const uploader = createCloudinaryUploader({ cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' });
    await uploader.upload({ buffer: Buffer.from('x'), contentType: 'image/jpeg', folder: 'demandas' });

    const opcoes = vi.mocked(cloudinary.uploader.upload_stream).mock.calls.at(-1)?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(opcoes.type).toBe('authenticated');
    expect(opcoes.folder).toBe('demandas');
    expect(opcoes.resource_type).toBe('image');
  });

  it('gera uma url assinada, temporária e do tipo authenticated a partir do publicId', () => {
    const antes = Math.floor(Date.now() / 1000);
    const uploader = createCloudinaryUploader({ cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' });

    const url = uploader.urlAssinada('demandas/abc123');

    expect(url).toBe('https://res.cloudinary.com/demo/image/authenticated/s--assinatura--/demandas/abc123');

    const [publicId, opcoes] = vi.mocked(cloudinary.url).mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(publicId).toBe('demandas/abc123');
    expect(opcoes.sign_url).toBe(true);
    expect(opcoes.type).toBe('authenticated');
    expect(opcoes.secure).toBe(true);
    expect(opcoes.expires_at as number).toBeGreaterThanOrEqual(antes + VALIDADE_URL_ASSINADA_SEGUNDOS);
  });
});
