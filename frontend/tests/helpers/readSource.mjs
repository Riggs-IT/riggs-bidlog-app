/** Read source contracts using the same local CSS import order as the app.
 * Non-CSS files retain normal fs.readFileSync behavior. No CSS is duplicated
 * in test fixtures, so these assertions exercise the actual owning modules.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readSource(file, encoding = 'utf8', ancestors = []) {
  const path = resolve(file instanceof URL ? fileURLToPath(file) : file);
  const text = readFileSync(path, encoding);
  if (extname(path) !== '.css') return text;
  if (ancestors.includes(path)) throw new Error('Cyclic stylesheet import: ' + path);
  const chain = [...ancestors, path];
  return String(text).replace(/^\s*@import\s+(['"])([^'"]+)\1\s*;/gm, (_, quote, name) => {
    if (!name.startsWith('./') || !name.endsWith('.css') || name.split('/').includes('..')) {
      throw new Error('Expected a local, unconditional stylesheet import: ' + name);
    }
    return readSource(resolve(dirname(path), name), encoding, chain);
  });
}
