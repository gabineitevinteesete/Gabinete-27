'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { apiClient, ApiError } from '@/services/api-client';
import { useAuth } from '@/hooks/use-auth';
import type { PublicUser } from '@/types/auth';

export default function PrimeiroAcessoPage() {
  return (
    <Suspense fallback={null}>
      <PrimeiroAcessoForm />
    </Suspense>
  );
}

function PrimeiroAcessoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId') ?? '';
  const { setUsuarioAutenticado } = useAuth();

  const [novoPin, setNovoPin] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);

    if (novoPin !== confirmacao) {
      setErro('Os PINs não coincidem');
      return;
    }

    setEnviando(true);
    try {
      const data = await apiClient.request<{ accessToken: string; user: PublicUser }>('/auth/primeiro-acesso', {
        method: 'POST',
        body: { userId, novoPin },
      });
      setUsuarioAutenticado(data.user, data.accessToken);
      router.push('/painel');
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível criar o PIN');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-card bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-primary-dark">Crie seu PIN</h1>
        <p className="mb-6 text-sm text-gray-600">
          Este é o seu primeiro acesso. Escolha um PIN de 6 dígitos que só você conhece.
        </p>

        <div className="flex flex-col gap-4">
          <TextField
            label="Novo PIN"
            name="novoPin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={novoPin}
            onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <TextField
            label="Confirme o PIN"
            name="confirmacao"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>

        {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}

        <div className="mt-6">
          <Button type="submit" disabled={novoPin.length !== 6 || confirmacao.length !== 6 || enviando}>
            {enviando ? 'Salvando…' : 'Criar PIN'}
          </Button>
        </div>
      </form>
    </main>
  );
}
