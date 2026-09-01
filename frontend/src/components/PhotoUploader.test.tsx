import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhotoUploader, type FotoSelecionada } from './PhotoUploader';

vi.mock('@/lib/photo-compression', () => ({ comprimirImagem: vi.fn() }));
import { comprimirImagem } from '@/lib/photo-compression';

beforeEach(() => {
  vi.mocked(comprimirImagem).mockReset();
  vi.mocked(comprimirImagem).mockImplementation(async () => new Blob(['fake'], { type: 'image/jpeg' }));
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake-url'), revokeObjectURL: vi.fn() });
});

function Wrapper() {
  const [fotos, setFotos] = useState<FotoSelecionada[]>([]);
  return <PhotoUploader fotos={fotos} onChange={setFotos} />;
}

describe('PhotoUploader', () => {
  it('mostra "0 de 4 fotos adicionadas" inicialmente', () => {
    render(<Wrapper />);
    expect(screen.getByText(/0 de 4 fotos adicionadas/i)).toBeInTheDocument();
  });

  it('adiciona uma prévia para cada arquivo selecionado', async () => {
    render(<Wrapper />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [arquivo] } });

    await waitFor(() => expect(screen.getByText(/1 de 4 fotos adicionadas/i)).toBeInTheDocument());
    expect(screen.getAllByAltText(/prévia da foto/i)).toHaveLength(1);
  });

  it('remove uma foto ao clicar no botão de remover', async () => {
    render(<Wrapper />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [arquivo] } });
    await waitFor(() => expect(screen.getByText(/1 de 4 fotos adicionadas/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/remover foto/i));
    await waitFor(() => expect(screen.getByText(/0 de 4 fotos adicionadas/i)).toBeInTheDocument());
  });

  it('revoga a URL do blob ao remover uma foto', async () => {
    render(<Wrapper />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [arquivo] } });
    await waitFor(() => expect(screen.getByText(/1 de 4 fotos adicionadas/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/remover foto/i));

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url'));
  });

  it('gera ids distintos para arquivos de mesmo nome selecionados juntos', async () => {
    render(<Wrapper />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const a = new File(['a'], 'foto.jpg', { type: 'image/jpeg' });
    const b = new File(['b'], 'foto.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [a, b] } });

    // Ids colidindo fariam o React renderizar uma prévia só (mesma `key`).
    await waitFor(() => expect(screen.getByText(/2 de 4 fotos adicionadas/i)).toBeInTheDocument());
    expect(screen.getAllByAltText(/prévia da foto/i)).toHaveLength(2);
  });

  it('mostra um erro quando a compressão de uma foto falha', async () => {
    vi.mocked(comprimirImagem).mockRejectedValueOnce(new Error('canvas indisponível'));

    render(<Wrapper />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [arquivo] } });

    expect(await screen.findByText(/não foi possível processar uma das fotos/i)).toBeInTheDocument();
    expect(screen.getByText(/0 de 4 fotos adicionadas/i)).toBeInTheDocument();
  });

  it('rejeita um arquivo com tipo não permitido', async () => {
    render(<Wrapper />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivoInvalido = new File(['conteudo'], 'documento.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [arquivoInvalido] } });

    expect(await screen.findByText(/apenas fotos em jpg, png ou webp/i)).toBeInTheDocument();
    expect(comprimirImagem).not.toHaveBeenCalled();
  });
});
