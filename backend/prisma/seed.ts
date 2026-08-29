import { hash } from '@node-rs/argon2';
import { prisma } from '../src/config/prisma.js';
import { isValidBrazilianPhone, normalizePhone } from '../src/utils/phone.js';
import { isPinFormatValid, isPinObvious } from '../src/utils/pin.js';

const ASSUNTOS_INICIAIS = [
  'Tapa-buraco',
  'Vazamento de água',
  'Vazamento de esgoto',
  'Iluminação pública',
  'Retirada de entulho',
  'Limpeza de terreno',
  'Poda de árvore',
  'Canaleta quebrada',
  'Limpeza de canaleta',
  'Sarjeta danificada',
  'Pintura de sinalização',
  'Sinalização viária',
  'Semáforo',
  'Redutor de velocidade',
  'Calçada e acessibilidade',
];

async function seedAssuntos() {
  for (const nome of ASSUNTOS_INICIAIS) {
    await prisma.requestType.upsert({
      where: { nome },
      update: {},
      create: { nome, ativo: true, exigeDescricaoObrigatoria: false },
    });
  }
  await prisma.requestType.upsert({
    where: { nome: 'Outros' },
    update: {},
    create: { nome: 'Outros', ativo: true, exigeDescricaoObrigatoria: true },
  });
  console.log(`Assuntos seedados: ${ASSUNTOS_INICIAIS.length + 1}`);
}

async function seedPrimeiroChefe() {
  const telefoneBruto = process.env.SEED_CHEFE_TELEFONE;
  const nome = process.env.SEED_CHEFE_NOME;
  const pin = process.env.SEED_CHEFE_PIN;

  if (!telefoneBruto || !nome || !pin) {
    console.log(
      'SEED_CHEFE_TELEFONE / SEED_CHEFE_NOME / SEED_CHEFE_PIN não definidos — pulando criação do primeiro chefe.',
    );
    return;
  }

  if (!isValidBrazilianPhone(telefoneBruto)) {
    console.log('SEED_CHEFE_TELEFONE não é um telefone brasileiro válido — pulando criação do primeiro chefe.');
    return;
  }

  if (!isPinFormatValid(pin)) {
    console.log('SEED_CHEFE_PIN precisa ter exatamente 6 dígitos — pulando criação do primeiro chefe.');
    return;
  }

  if (isPinObvious(pin)) {
    console.log('SEED_CHEFE_PIN é óbvio demais (sequência ou repetição) — pulando criação do primeiro chefe.');
    return;
  }

  // Normalizado para casar com o formato gravado por UserService.criarAssessor e com o
  // telefone normalizado que AuthService.login usa na busca.
  const telefone = normalizePhone(telefoneBruto);

  const existente = await prisma.user.findUnique({ where: { telefone } });
  if (existente) {
    console.log('Já existe usuário com esse telefone — pulando criação do primeiro chefe.');
    return;
  }

  const pinHash = await hash(pin);
  await prisma.user.create({
    data: {
      nome,
      telefone,
      role: 'CHEFE',
      ativo: true,
      pinDefinido: true,
      pinHash,
    },
  });
  // Sem nome nem telefone no log: nenhum dado pessoal em logs.
  console.log('Primeiro chefe criado.');
}

async function main() {
  await seedAssuntos();
  await seedPrimeiroChefe();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
