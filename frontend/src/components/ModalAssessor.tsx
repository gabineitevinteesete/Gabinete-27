'use client';

import { useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { maskPhone } from '@/lib/phone-mask';
import { ROLE_LABEL, ROLE_OPTIONS } from '@/lib/user-role';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import type { PublicUser, UserRoleValue } from '@/types/auth';

interface ModalAssessorProps {
  modo: 'criar' | 'editar';
  assessor?: PublicUser;
  onFechar: () => void;
  onSalvo: (assessor: PublicUser) => void;
}

export function ModalAssessor({ modo, assessor, onFechar, onSalvo }: ModalAssessorProps) {
  const [nome, setNome] = useState(assessor?.nome ?? '');
  const [telefone, setTelefone] = useState(assessor?.telefone ?? '');
  const [role, setRole] = useState<UserRoleValue>(assessor?.role ?? 'ASSESSOR_RUA');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setEnviando(true);
    setErro(null);
    try {
      const resultado =
        modo === 'criar'
          ? await apiClient.request<PublicUser>('/usuarios', {
              method: 'POST',
              auth: true,
              body: { nome, telefone, role },
            })
          : await apiClient.request<PublicUser>(`/usuarios/${assessor!.id}`, {
              method: 'PATCH',
              auth: true,
              body: { nome, telefone },
            });
      onSalvo(resultado);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const formValido = nome.trim().length >= 2 && telefone.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-dark">
            {modo === 'criar' ? 'Novo assessor' : 'Editar assessor'}
          </h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <TextField label="Nome" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <TextField
            label="Telefone"
            name="telefone"
            inputMode="numeric"
            value={maskPhone(telefone)}
            onChange={(e) => setTelefone(e.target.value)}
          />

          {modo === 'criar' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="role" className="text-sm font-medium text-gray-700">
                Papel
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRoleValue)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              >
                {ROLE_OPTIONS.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {ROLE_LABEL[opcao]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button type="button" onClick={salvar} disabled={!formValido || enviando}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Button>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
