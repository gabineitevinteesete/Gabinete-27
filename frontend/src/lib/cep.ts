export interface EnderecoViaCep {
  rua: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export type BuscarCepResultado =
  | { status: 'ok'; endereco: EnderecoViaCep }
  | { status: 'nao_encontrado' }
  | { status: 'erro' };

export async function buscarCep(cepBruto: string): Promise<BuscarCepResultado> {
  const cep = cepBruto.replace(/\D/g, '');
  if (cep.length !== 8) {
    return { status: 'erro' };
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!res.ok) {
      return { status: 'erro' };
    }
    const dados = await res.json();
    if (dados.erro) {
      return { status: 'nao_encontrado' };
    }
    return {
      status: 'ok',
      endereco: {
        rua: dados.logradouro ?? '',
        bairro: dados.bairro ?? '',
        cidade: dados.localidade ?? '',
        estado: dados.uf ?? '',
      },
    };
  } catch {
    return { status: 'erro' };
  }
}
