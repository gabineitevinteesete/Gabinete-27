export async function comprimirImagem(arquivo: File, larguraMaxima = 1600, qualidade = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, larguraMaxima / bitmap.width);
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Este navegador não suporta o processamento de imagem necessário');
  }
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir a imagem'))),
      'image/jpeg',
      qualidade,
    );
  });
}
