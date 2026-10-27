import { defineConfig } from 'vitest/config';
import path from 'node:path';

/* Le noyau est du TypeScript pur : ni React, ni React Native, ni réseau. Il
   se teste donc dans Node, sans simulateur et en moins d'une seconde — c'est
   tout l'intérêt de la règle du § 3 du plan de portage.

   Les composants, eux, se testeront avec jest-expo le jour où il y en aura
   assez pour le justifier. */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/core/**/*.test.ts'],
    environment: 'node',
  },
});
