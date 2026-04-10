// worker-bootstrap.js
// This small bootstrapper tries several known CDN locations for sqlite-wasm
// and re-exports them to the worker via importScripts. If you have placed
// the runtime files locally under `/sqlite/`, the worker will load them first.

(function () {
  const candidates = [
    '/sqlite/sqlite-wasm.js',
    '/sqlite/sqlite-asm.js',
    '/sqlite/sql-wasm.js',
    'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.js',
    'https://unpkg.com/sql.js@1.8.0/dist/sql-wasm.js'
  ];

  for (const url of candidates) {
    try {
      importScripts(url);
      // If importScripts succeeded, stop trying further candidates.
      // The worker that imported this script should detect available
      // initializer functions on `self`/globalThis.
      break;
    } catch (e) {
      // ignore and try next
    }
  }
})();
