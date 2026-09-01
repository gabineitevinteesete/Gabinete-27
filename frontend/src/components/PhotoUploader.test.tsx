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

  it('rejeita um arquivo com tipo não permitido', async () => {
    render(<Wrapper />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivoInvalido = new File(['conteudo'], 'documento.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [arquivoInvalido] } });

    expect(await screen.findByText(/apenas fotos em jpg, png ou webp/i)).toBeInTheDocument();
    expect(comprimirImagem).not.toHaveBeenCalled();
  });
});
