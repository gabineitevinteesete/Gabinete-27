'use client';

import { useRef, useState } from 'react';
import { comprimirImagem } from '@/lib/photo-compression';

export interface FotoSelecionada {
  id: string;
  blob: Blob;
  previewUrl: string;
}

interface PhotoUploaderProps {
  fotos: FotoSelecionada[];
  onChange: (fotos: FotoSelecionada[]) => void;
  minimo?: number;
  maximo?: number;
}

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

export function PhotoUploader({ fotos, onChange, minimo = 2, maximo = 4 }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function handleArquivos(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    setErro(null);

    const espacoDisponivel = maximo - fotos.length;
    const selecionados = Array.from(arquivos).slice(0, espacoDisponivel);

    const invalido = selecionados.find((arquivo) => !TIPOS_PERMITIDOS.includes(arquivo.type));
    if (invalido) {
      setErro('Envie apenas fotos em JPG, PNG ou WebP.');
      return;
    }

    const novasFotos: FotoSelecionada[] = [];
    for (const arquivo of selecionados) {
      const blob = await comprimirImagem(arquivo);
      novasFotos.push({ id: `${Date.now()}-${arquivo.name}`, blob, previewUrl: URL.createObjectURL(blob) });
    }

    onChange([...fotos, ...novasFotos]);
  }

  function remover(id: string) {
    onChange(fotos.filter((foto) => foto.id !== id));
  }

  return (
    <div>
      <div className="flex gap-2">
        {fotos.map((foto) => (
          <div key={foto.id} className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.previewUrl} alt="Prévia da foto" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remover(foto.id)}
              aria-label="Remover foto"
              className="absolute right-0 top-0 bg-black/60 px-1 text-xs text-white"
            >
              ×
            </button>
          </div>
        ))}
        {fotos.length < maximo && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-primary text-primary"
          >
            +
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => handleArquivos(e.target.files)}
      />
      <p className="mt-1 text-xs text-gray-500">
        {fotos.length} de {maximo} fotos adicionadas (mínimo {minimo})
      </p>
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  );
}
