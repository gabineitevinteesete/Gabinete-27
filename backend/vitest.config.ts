import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/helpers/setup-env.ts'],
    // Vários arquivos de teste de integração compartilham UM banco Postgres real (via
    // resetDb()/deleteMany()); rodar arquivos em paralelo faz um arquivo apagar os dados
    // que outro está usando no meio do teste. Serializa a execução dos arquivos.
    fileParallelism: false,
    // O Postgres real (Neon) usado nos testes de integração fica na rede; testes que
    // criam vários registros em sequência (ex.: paginação) podem passar dos 5s padrão
    // do Vitest. Damos mais folga para não confundir latência de rede com regressão.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
