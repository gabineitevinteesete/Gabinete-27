import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { processarFoto } from '../../src/services/photo-processing.service.js';

async function criarJpegDeTeste(largura: number, altura: number): Promise<Buffer> {
  return sharp({
    create: { width: largura, height: altura, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .jpeg()
    .withExif({ IFD0: { Make: 'TesteCamera' } })
    .toBuffer();
}

describe('processarFoto', () => {
  it('aceita um JPEG válido e remove metadados EXIF', async () => {
    const original = await criarJpegDeTeste(100, 80);
    const originalMeta = await sharp(original).metadata();
    expect(originalMeta.exif).toBeDefined();

    const resultado = await processarFoto(original);
    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.foto.contentType).toBe('image/jpeg');
      expect(resultado.foto.larguraPx).toBe(100);
      expect(resultado.foto.alturaPx).toBe(80);

      const metaProcessada = await sharp(resultado.foto.buffer).metadata();
      expect(metaProcessada.exif).toBeUndefined();
    }
  });

  it('aceita PNG e detecta o content-type correto', async () => {
    const pngBuffer = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const resultado = await processarFoto(pngBuffer);
    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.foto.contentType).toBe('image/png');
    }
  });

  it('redimensiona uma imagem maior que 2000px no maior lado', async () => {
    const grande = await criarJpegDeTeste(3000, 1500);
    const resultado = await processarFoto(grande);
    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.foto.larguraPx).toBeLessThanOrEqual(2000);
      expect(resultado.foto.alturaPx).toBeLessThanOrEqual(2000);
    }
  });

  it('não amplia uma imagem menor que 2000px', async () => {
    const pequena = await criarJpegDeTeste(100, 80);
    const resultado = await processarFoto(pequena);
    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.foto.larguraPx).toBe(100);
      expect(resultado.foto.alturaPx).toBe(80);
    }
  });

  it('rejeita um arquivo que não é uma imagem', async () => {
    const naoImagem = Buffer.from('isto nao e uma imagem, e so texto mesmo');
    const resultado = await processarFoto(naoImagem);
    expect(resultado.status).toBe('tipo_invalido');
  });

  it('rejeita uma imagem acima do limite de pixels (bomba de descompressão)', async () => {
    // ~52 MP num arquivo de poucas centenas de KB: acima do teto de 50 MP do serviço, mas
    // abaixo do limite padrão do sharp — sem `limitInputPixels` isto decodificaria normalmente
    // e alocaria ~150 MB de memória nativa.
    const bomba = await sharp({
      create: { width: 8000, height: 6500, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg({ quality: 40 })
      .toBuffer();

    const resultado = await processarFoto(bomba);
    expect(resultado.status).toBe('tipo_invalido');
  });

  it('rejeita formatos de imagem não autorizados (ex: GIF)', async () => {
    const gifBuffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 1, b: 1 } },
    })
      .gif()
      .toBuffer();

    const resultado = await processarFoto(gifBuffer);
    expect(resultado.status).toBe('tipo_invalido');
  });
});
