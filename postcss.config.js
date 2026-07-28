import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pin Tailwind to this project's config explicitly. Without it, Tailwind
// searches upwards from process.cwd(), which picks up the wrong config when
// Vite is invoked from another directory.
const root = dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: join(root, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
