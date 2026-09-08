import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Consulta via SQL bruto (em vez de `prisma.request.findMany({ where: { criadoPorId: null } })`):
  // depois do Step 5 desta mesma task o campo passa a ser obrigatório no schema, e o Prisma Client
  // gerado a partir dele deixa de aceitar `null` nesse filtro — este script fica em código-fonte como
  // registro histórico da migração de dados, então evitamos depender de um tipo que não existe mais.
  const demandas = await prisma.$queryRaw<{ id: string; assessorResponsavelId: string }[]>`
    SELECT "id", "assessorResponsavelId" FROM "requests" WHERE "criadoPorId" IS NULL
  `;

  console.log(`${demandas.length} demanda(s) sem criadoPorId encontradas.`);

  let atualizadas = 0;
  for (const demanda of demandas) {
    const primeiraReatribuicao = await prisma.requestReassignmentHistory.findFirst({
      where: { requestId: demanda.id },
      orderBy: { createdAt: 'asc' },
      select: { assessorAnteriorId: true },
    });

    const criadoPorId = primeiraReatribuicao?.assessorAnteriorId ?? demanda.assessorResponsavelId;

    await prisma.request.update({
      where: { id: demanda.id },
      data: { criadoPorId },
    });
    atualizadas++;
  }

  console.log(`${atualizadas} demanda(s) atualizadas.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (erro) => {
    console.error(erro);
    await prisma.$disconnect();
    process.exit(1);
  });
