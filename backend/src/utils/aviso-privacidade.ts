/**
 * Texto atual do aviso de privacidade, gravado literalmente em `PrivacyConsent.textoVersao`
 * a cada demanda criada — se este texto mudar no futuro, demandas já criadas continuam com
 * o texto que foi de fato apresentado no momento do consentimento.
 *
 * Mantenha idêntico a `frontend/src/lib/aviso-privacidade.ts` (cópia de exibição, sem pacote
 * compartilhado entre os dois projetos).
 */
export const AVISO_PRIVACIDADE_TEXTO_ATUAL = `Aviso de Privacidade — Gabinete Digital

Este é o aviso de privacidade citado no formulário de nova demanda. Ele explica, de forma simples, o que fazemos com os dados de quem solicita um atendimento.

O que coletamos: seu nome, telefone e endereço (rua, número, bairro, cidade), além da descrição do problema relatado. Quando há foto, ela é sempre do local ou da estrutura (por exemplo, o buraco na rua ou a sinalização faltando) — nunca de pessoas.

Para que usamos: exclusivamente para registrar, acompanhar e responder à sua solicitação junto ao gabinete. Seus dados não são usados para nenhuma outra finalidade, como envio de propaganda.

Quem tem acesso: a equipe do gabinete responsável por atender e encaminhar solicitações. As fotos ficam armazenadas em um serviço de nuvem (Cloudinary), protegidas contra acesso externo.

Por quanto tempo guardamos: enquanto for necessário para o acompanhamento da sua solicitação. Ainda não temos um prazo automático de exclusão definido — isso está em avaliação.

Seus direitos: a qualquer momento você pode pedir para saber quais dados temos sobre você, corrigi-los ou solicitar a exclusão. Basta falar com o assessor ou assessora que fez seu atendimento.

Ao marcar a caixa de autorização, você confirma que está de acordo com o uso dos seus dados conforme descrito acima.`;
