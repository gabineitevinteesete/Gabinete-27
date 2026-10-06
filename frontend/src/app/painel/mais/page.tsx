'use client';

import { useAuth } from '@/hooks/use-auth';

const LINKS = [
  { href: '/painel/configuracoes', titulo: 'Configurações', descricao: 'Tipos de demanda' },
  { href: '/painel/privacidade', titulo: 'Privacidade', descricao: 'Anonimizar dados de um cidadão' },
];

export default function MaisPage() {
  const { user } = useAuth();

  if (user?.role !== 'CHEFE') {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Mais</h1>
      <div className="flex flex-col gap-2">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className="rounded-card bg-white p-4 shadow-sm">
            <p className="font-medium text-gray-900">{link.titulo}</p>
            <p className="text-sm text-gray-600">{link.descricao}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
