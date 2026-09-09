import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { comprimirImagem } from './photo-compression';

describe('comprimirImagem', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redimensiona mantendo a proporção quando a imagem é maior que a largura máxima', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3200, height: 1600, close: vi.fn() })));
    const drawImage = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback: BlobCallback) {
      callback(new Blob(['fake'], { type: 'image/jpeg' }));
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    await comprimirImagem(arquivo, 1600, 0.8);

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
  });

  it('não amplia uma imagem menor que a largura máxima', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 300, close: vi.fn() })));
    const drawImage = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback: BlobCallback) {
      callback(new Blob(['fake'], { type: 'image/jpeg' }));
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    await comprimirImagem(arquivo, 1600, 0.8);

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 400, 300);
  });

  it('resolve com um Blob', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 300, close: vi.fn() })));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback: BlobCallback) {
      callback(new Blob(['fake'], { type: 'image/jpeg' }));
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    const resultado = await comprimirImagem(arquivo);
    expect(resultado).toBeInstanceOf(Blob);
  });
});
