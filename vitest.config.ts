import { configDefaults, defineConfig } from 'vitest/config';

// Les tests de rendu réel (*.e2e.test.ts) sont lents : ils passent par `npm run test:rendu`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '**/*.e2e.test.ts', '.venv/**'] },
});
