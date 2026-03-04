import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

/**
 * Embeds the locally-built plunk dist into a virtual module so the
 * WebContainer uses local code instead of the npm-published package.
 * Run `pnpm build` in the repo root before starting the playground.
 */
function localPlunkDev(): Plugin {
  const plunkRoot = join(__dir, '..');
  const distDir = join(plunkRoot, 'dist');
  const pkgPath = join(plunkRoot, 'package.json');

  return {
    name: 'local-plunk-dev',
    resolveId(id) {
      if (id === 'virtual:local-plunk') return '\0virtual:local-plunk';
    },
    load(id) {
      if (id !== '\0virtual:local-plunk') return;

      if (!existsSync(distDir)) {
        console.warn('[local-plunk-dev] dist/ not found — run `pnpm build` in repo root first');
        return 'export default null;';
      }

      // Build a flat FileSystemTree: { 'package.json': {file:{contents}}, dist: {directory:{...}} }
      const pkgJson = readFileSync(pkgPath, 'utf-8');
      const distFiles: Record<string, { file: { contents: string } }> = {};
      for (const name of readdirSync(distDir)) {
        distFiles[name] = { file: { contents: readFileSync(join(distDir, name), 'utf-8') } };
      }

      const tree = {
        'package.json': { file: { contents: pkgJson } },
        dist: { directory: distFiles },
      };

      return `export default ${JSON.stringify(tree)};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localPlunkDev()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    port: 5174,
  },
});
