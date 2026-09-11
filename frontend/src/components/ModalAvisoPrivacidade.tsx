'use client';

import { AVISO_PRIVACIDADE_TEXTO } from '@/lib/aviso-privacidade';
import { Button } from '@/components/Button';

interface ModalAvisoPrivacidadeProps {
  onFechar: () => void;
}

export function ModalAvisoPrivacidade({ onFechar }: ModalAvisoPrivacidadeProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-dark">Aviso de privacidade</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar aviso de privacidade"
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto whitespace-pre-line text-sm text-gray-700">
          {AVISO_PRIVACIDADE_TEXTO}
        </div>

        <Button type="button" onClick={onFechar} className="mt-4">
          Fechar
        </Button>
      </div>
    </div>
  );
}
