import { hash } from '@node-rs/argon2';
import { prisma } from '../src/config/prisma.js';

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
  const telefone = process.env.SEED_CHEFE_TELEFONE;
  const nome = process.env.SEED_CHEFE_NOME;
  const pin = process.env.SEED_CHEFE_PIN;

  if (!telefone || !nome || !pin) {
    console.log(
      'SEED_CHEFE_TELEFONE / SEED_CHEFE_NOME / SEED_CHEFE_PIN não definidos — pulando criação do primeiro chefe.',
    );
    return;
  }

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
  console.log(`Primeiro chefe criado: ${nome} (${telefone})`);
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
