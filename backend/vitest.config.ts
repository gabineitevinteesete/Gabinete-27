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
  },
});
