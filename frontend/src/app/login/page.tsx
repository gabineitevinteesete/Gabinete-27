'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { maskPhone } from '@/lib/phone-mask';
import { useAuth } from '@/hooks/use-auth';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [telefone, setTelefone] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const telefoneDigitos = telefone.replace(/\D/g, '');
  const formValido = useMemo(() => telefoneDigitos.length >= 10 && pin.length === 6, [telefoneDigitos, pin]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resultado = await login(telefone, pin);
      if (resultado.status === 'ok') {
        router.push('/painel');
      } else if (resultado.status === 'primeiro_acesso') {
        router.push(`/primeiro-acesso?userId=${resultado.userId}`);
      } else {
        setErro(resultado.mensagem);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-card bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-semibold text-primary-dark">Gabinete digital</h1>
        <p className="mb-6 text-sm text-gray-600">Entre com seu telefone e PIN</p>

        <div className="flex flex-col gap-4">
          <TextField
            label="Telefone"
            name="telefone"
            inputMode="numeric"
            placeholder="(34) 99999-8888"
            value={maskPhone(telefone)}
            onChange={(e) => setTelefone(e.target.value)}
          />
          <TextField
            label="PIN de 6 dígitos"
            name="pin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="••••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>

        {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}

        <div className="mt-6">
          <Button type="submit" disabled={!formValido || enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
        </div>
      </form>
    </main>
  );
}
