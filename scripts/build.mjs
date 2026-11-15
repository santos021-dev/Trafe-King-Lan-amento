import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function build() {
  const destination = path.resolve(root, 'dist');
  if (path.dirname(destination) !== root || path.basename(destination) !== 'dist') throw new Error('Invalid build path');
  if (fs.existsSync(destination) && (fs.lstatSync(destination).isSymbolicLink() || fs.realpathSync(destination) !== destination)) throw new Error('Unsafe build destination');
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  // Lista explícita: nunca publicar .env, server/, scripts/, migrations/, testes ou node_modules.
  for (const entry of ['index.html', 'assets', 'sobre', 'termos', 'privacidade', 'descadastro']) {
    fs.cpSync(path.join(root, entry), path.join(destination, entry), { recursive: true, dereference: false });
  }
  console.log('Build estático criado; APIs são executadas separadamente no servidor.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
