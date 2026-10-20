import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const entry of ['38LaThuRockefellerGuiChoConTrai.pdf', 'README.md', 'app.js', 'assets', 'favicon.ico', 'index.html', 'robots.txt', 'scratch', 'site.webmanifest', 'sitemap.xml', 'styles.css']) {
  cpSync(join(root, entry), join(dist, entry), { recursive: true });
}

console.log(`Built static site in ${dist}`);
