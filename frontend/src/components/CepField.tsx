'use client';

import { useState } from 'react';
import { TextField } from '@/components/TextField';
import { buscarCep, type EnderecoViaCep } from '@/lib/cep';

interface CepFieldProps {
  value: string;
  onChange: (cep: string) => void;
  onEnderecoEncontrado: (endereco: EnderecoViaCep) => void;
}

export function CepField({ value, onChange, onEnderecoEncontrado }: CepFieldProps) {
  const [estado, setEstado] = useState<'ocioso' | 'carregando' | 'nao_encontrado' | 'erro'>('ocioso');

  async function handleBlur() {
    const digitos = value.replace(/\D/g, '');
    if (digitos.length !== 8) return;

    setEstado('carregando');
    const resultado = await buscarCep(value);
    if (resultado.status === 'ok') {
      setEstado('ocioso');
      onEnderecoEncontrado(resultado.endereco);
    } else {
      setEstado(resultado.status === 'nao_encontrado' ? 'nao_encontrado' : 'erro');
    }
  }

  return (
    <div>
      <TextField
        label="CEP"
        name="cep"
        inputMode="numeric"
        placeholder="38400-000"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
      />
      {estado === 'carregando' && <p className="mt-1 text-xs text-gray-500">Buscando endereço…</p>}
      {estado === 'nao_encontrado' && (
        <p className="mt-1 text-xs text-red-600">CEP não encontrado — preencha o endereço manualmente.</p>
      )}
      {estado === 'erro' && (
        <p className="mt-1 text-xs text-red-600">Não foi possível consultar o CEP agora — preencha manualmente.</p>
      )}
    </div>
  );
}
