// wasmWorker: initializes sqlite-wasm with HTTP VFS and handles SQL execution requests.
// Note: This worker expects `@sqlite.org/sqlite-wasm` to be installed and bundled by the build.
// Due to bundler/worker constraints, you may need to load the sqlite-wasm worker script via importScripts

let Sqlite3 = null
let db = null

async function init(sqliteWasmUrl) {
    try {
      // NOTE: Many sqlite-wasm distributions are not published on npm. If you have
      // bundled sqlite-wasm, you can import it here. Otherwise follow the README
      // to download the runtime files and load them via importScripts.
      if (typeof importScripts === 'function' && sqliteWasmUrl) {
        // Example pattern when using distribution files: importScripts('/sqlite/sqlite-asm.js')
        try {
          importScripts(sqliteWasmUrl)
          postMessage({ type: 'log', text: 'Loaded sqlite-wasm via importScripts ' + sqliteWasmUrl })
          // The global initializer name varies by distribution; user will update here.
          // e.g. const sqlite = await initSqlJs({ locateFile: f => '/sqlite/' + f })
          return { imported: true }
        } catch (inner) {
          postMessage({ type: 'log', text: 'importScripts failed: ' + String(inner) })
        }
      }

      // Fallback: attempt dynamic import (works only when sqlite-wasm is bundled)
      Sqlite3 = await import('@sqlite.org/sqlite-wasm').catch(() => null)
      if (Sqlite3) {
        postMessage({ type: 'log', text: 'Imported sqlite-wasm module' })
        const sqlite = await Sqlite3.initSqlJs({ locateFile: filename => filename })
        postMessage({ type: 'log', text: 'Initialized sqlite-wasm runtime' })
        return sqlite
      }

      postMessage({ type: 'log', text: 'sqlite-wasm not available; worker will operate in simulated mode' })
      return null
    } catch (e) {
      postMessage({ type: 'error', text: 'Failed to initialize sqlite-wasm: ' + String(e) })
      throw e
    }
}

// Keep a simple queue for exec requests
self.addEventListener('message', async (ev) => {
  const msg = ev.data
  try {
    if (msg.type === 'init') {
      // msg.sqliteWasmUrl optional
      await init(msg.sqliteWasmUrl)
      postMessage({ type: 'ready' })
    }

    if (msg.type === 'open') {
      // For HTTP VFS, sqlite-wasm provides a VFS plugin; here we rely on the higher-level API
      // This worker currently simulates opening; replacing with a true VFS requires bundling the sqlite-wasm http vfs plugin.
      postMessage({ type: 'log', text: `WASM worker: (simulated) open ${msg.url}` })
      postMessage({ type: 'opened', url: msg.url })
    }

    if (msg.type === 'exec') {
      const sql = msg.sql
      postMessage({ type: 'log', text: `WASM worker: executing SQL: ${sql}` })
      // Simulation: return a fake row set. Replace this with real sqlite exec when db is opened.
      const rows = [{ seqid: 'chr1', start: 100, end: 200, attributes: 'ID=gene0' }]
      postMessage({ type: 'result', sql, rows })
    }
  } catch (err) {
    postMessage({ type: 'error', text: String(err) })
  }
})
// wasmWorker: initializes sqlite-wasm with HTTP VFS and handles SQL execution requests.
// Note: This worker expects `@sqlite.org/sqlite-wasm` to be installed and bundled by the build.
// Due to bundler/worker constraints, you may need to load the sqlite-wasm worker script via importScripts

let Sqlite3 = null
let db = null

async function init(sqliteWasmUrl) {
    try {
      // NOTE: Many sqlite-wasm distributions are not published on npm. If you have
      // bundled sqlite-wasm, you can import it here. Otherwise follow the README
      // to download the runtime files and load them via importScripts.
      if (typeof importScripts === 'function' && sqliteWasmUrl) {
        // Example pattern when using distribution files: importScripts('/sqlite/sqlite-asm.js')
        try {
          importScripts(sqliteWasmUrl)
          postMessage({ type: 'log', text: 'Loaded sqlite-wasm via importScripts ' + sqliteWasmUrl })
          // The global initializer name varies by distribution; user will update here.
          // e.g. const sqlite = await initSqlJs({ locateFile: f => '/sqlite/' + f })
          return { imported: true }
        } catch (inner) {
          postMessage({ type: 'log', text: 'importScripts failed: ' + String(inner) })
        }
      }

      // Fallback: attempt dynamic import (works only when sqlite-wasm is bundled)
      Sqlite3 = await import('@sqlite.org/sqlite-wasm').catch(() => null)
      if (Sqlite3) {
        postMessage({ type: 'log', text: 'Imported sqlite-wasm module' })
        const sqlite = await Sqlite3.initSqlJs({ locateFile: filename => filename })
        postMessage({ type: 'log', text: 'Initialized sqlite-wasm runtime' })
        return sqlite
      }

      postMessage({ type: 'log', text: 'sqlite-wasm not available; worker will operate in simulated mode' })
      return null
    } catch (e) {
      postMessage({ type: 'error', text: 'Failed to initialize sqlite-wasm: ' + String(e) })
      throw e
    }
}

// Keep a simple queue for exec requests
self.addEventListener('message', async (ev) => {
  const msg = ev.data
  try {
    if (msg.type === 'init') {
      // msg.sqliteWasmUrl optional
      await init(msg.sqliteWasmUrl)
      postMessage({ type: 'ready' })
    }

    if (msg.type === 'open') {
      // For HTTP VFS, sqlite-wasm provides a VFS plugin; here we rely on the higher-level API
      // This worker currently simulates opening; replacing with a true VFS requires bundling the sqlite-wasm http vfs plugin.
      postMessage({ type: 'log', text: `WASM worker: (simulated) open ${msg.url}` })
      postMessage({ type: 'opened', url: msg.url })
    }

    if (msg.type === 'exec') {
      const sql = msg.sql
      postMessage({ type: 'log', text: `WASM worker: executing SQL: ${sql}` })
      // Simulation: return a fake row set. Replace this with real sqlite exec when db is opened.
      const rows = [{ seqid: 'chr1', start: 100, end: 200, attributes: 'ID=gene0' }]
      postMessage({ type: 'result', sql, rows })
    }
  } catch (err) {
    postMessage({ type: 'error', text: String(err) })
  }
})

