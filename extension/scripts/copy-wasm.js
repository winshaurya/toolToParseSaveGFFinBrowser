const fs = require('fs');
const path = require('path');

function safeCopy(src, dest) {
  try {
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log(`copied ${src} -> ${dest}`);
      return true;
    }
  } catch (err) {
    console.error('copy failed', src, err && err.message);
  }
  return false;
}

const root = path.resolve(__dirname, '..');
const nm = path.join(root, 'node_modules', 'sql.js', 'dist');
const destDir = path.join(root, 'public', 'sqlite');

const candidates = [
  'sql-wasm.js',
  'sql-wasm.wasm',
  'sql-wasm-browser.js',
  'sql-wasm-browser.wasm',
  'sql-asm.js',
  'sql-asm-debug.js'
];

let any = false;
for (const f of candidates) {
  const src = path.join(nm, f);
  const dest = path.join(destDir, f.replace(/^sql-/, '').replace(/^-/, ''));
  // preserve original filename for wasm and js variants
  const destKeep = path.join(destDir, f);
  if (safeCopy(src, destKeep)) any = true;
}

if (!any) {
  console.warn('No runtime files were copied. Ensure sql.js is installed and run `npm install` in the extension folder.');
}
