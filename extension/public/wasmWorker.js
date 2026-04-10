// wasmWorker (public copy)
// Copied into /public so Vite will copy it to dist root and the extension can
// load it at runtime via a simple Worker('/wasmWorker.js') call without
// Vite attempting to bundle it as a module worker.

let sqliteRuntime = null
let db = null
let vfsHttpRegistered = false

async function tryImportScripts(candidates) {
  if (typeof importScripts !== 'function') return null
  for (const url of candidates) {
    try {
      importScripts(url)
      postMessage({ type: 'log', text: `importScripts succeeded: ${url}` })
      return url
    } catch (err) {
      // try next
    }
  }
  return null
}

async function init(sqliteWasmUrl) {
  try {
    const localCandidates = [
      '/sqlite/worker-bootstrap.js',
      '/sqlite/sqlite-wasm.js',
      '/sqlite/sqlite-asm.js',
      '/sqlite/sql-wasm.js'
    ]
    await tryImportScripts(localCandidates)

    const cdnCandidates = [
      'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.js',
      'https://unpkg.com/sql.js@1.8.0/dist/sql-wasm.js'
    ]
    await tryImportScripts(cdnCandidates)

    let imported = null
    try {
      imported = await import('sql.js')
    } catch (e) {
      imported = null
    }

    const initCandidates = [
      globalThis.initSqlJs,
      globalThis.init_sql_js,
      globalThis.initSqlite,
      globalThis.sqlite3InitModule,
      imported?.initSqlJs,
      imported?.default?.initSqlJs,
      imported?.default
    ]

    let initFn = null
    for (const fn of initCandidates) {
      if (typeof fn === 'function') {
        initFn = fn
        break
      }
    }

    if (!initFn) {
      postMessage({ type: 'log', text: 'No sqlite init function found; entering simulated mode' })
      return null
    }

    const config = { locateFile: (f) => '/sqlite/' + f }
    sqliteRuntime = await initFn(config)
    postMessage({ type: 'log', text: 'sqlite runtime initialized' })

    try {
      try {
        const httpModule = await import('sqlite-wasm-http')
        if (httpModule && typeof httpModule.createHttpBackend === 'function') {
          postMessage({ type: 'log', text: 'sqlite-wasm-http module found, creating HTTP backend' })
          const httpBackend = await httpModule.createHttpBackend({ timeout: 15000 })
          const sqliteThread = await httpModule.createSQLiteThread({ http: httpBackend })
          sqliteRuntime._thread = sqliteThread
          vfsHttpRegistered = true
        }
      } catch (e) {
        // sqlite-wasm-http not available; continue
      }

      if (typeof sqliteRuntime.register_vfs_http === 'function') {
        await sqliteRuntime.register_vfs_http()
        vfsHttpRegistered = true
      } else if (sqliteRuntime.vfs_http && typeof sqliteRuntime.vfs_http.register === 'function') {
        await sqliteRuntime.vfs_http.register(sqliteRuntime)
        vfsHttpRegistered = true
      } else if (typeof sqliteRuntime.register_vfs === 'function') {
        try {
          await sqliteRuntime.register_vfs('http', {})
          vfsHttpRegistered = true
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      postMessage({ type: 'log', text: 'HTTP VFS registration failed: ' + String(e) })
    }

    if (vfsHttpRegistered) postMessage({ type: 'log', text: 'HTTP VFS appears registered' })
    else postMessage({ type: 'log', text: 'HTTP VFS not registered; falling back to full-file loads' })

    return sqliteRuntime
  } catch (e) {
    postMessage({ type: 'error', text: 'Failed to initialize sqlite runtime: ' + String(e) })
    return null
  }
}

function rowsFromExec(execRes) {
  if (!execRes || execRes.length === 0) return []
  const out = []
  for (const block of execRes) {
    const cols = block.columns
    for (const row of block.values) {
      const obj = {}
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i]
      out.push(obj)
    }
  }
  return out
}

self.addEventListener('message', async (ev) => {
  const msg = ev.data
  try {
    if (msg.type === 'init') {
      await init(msg.sqliteWasmUrl)
      postMessage({ type: 'ready', vfs: vfsHttpRegistered })
      return
    }

    if (msg.type === 'open') {
      const url = msg.url
      if (!url) {
        postMessage({ type: 'error', text: 'open requires url' })
        return
      }

      try {
        if (sqliteRuntime && sqliteRuntime._thread) {
          try {
            const thread = sqliteRuntime._thread
            await thread('open', { filename: 'file:' + encodeURI(url), vfs: 'http' })
            db = thread
            postMessage({ type: 'opened', url, method: 'http-thread' })
            return
          } catch (e) {
            postMessage({ type: 'log', text: 'thread open failed: ' + String(e) })
          }
        }

        if (vfsHttpRegistered && sqliteRuntime && typeof sqliteRuntime.open === 'function') {
          db = await sqliteRuntime.open(url)
          postMessage({ type: 'opened', url })
          return
        }

        if (sqliteRuntime && typeof sqliteRuntime.Database === 'function') {
          const r = await fetch(url)
          if (!r.ok) throw new Error('HTTP ' + r.status)
          const buf = await r.arrayBuffer()
          db = new sqliteRuntime.Database(new Uint8Array(buf))
          postMessage({ type: 'opened', url, method: 'full-fetch' })
          return
        }

        postMessage({ type: 'error', text: 'No suitable runtime to open DB' })
      } catch (e) {
        postMessage({ type: 'error', text: 'open failed: ' + String(e) })
      }
    }

    if (msg.type === 'exec') {
      const sql = msg.sql
      const context = msg.context || null
      if (!db) {
        postMessage({ type: 'error', text: 'No DB opened' })
        return
      }
      try {
        if (typeof db === 'function') {
          const thread = db
          const rows = []
          await thread('exec', {
            sql,
            bind: {},
            callback: (msg) => {
              if (msg.row) {
                const obj = {}
                for (let i = 0; i < (msg.columnNames || []).length; i++) {
                  obj[msg.columnNames[i]] = msg.row[i]
                }
                rows.push(obj)
              }
            }
          })
          postMessage({ type: 'result', sql, rows, context })
        } else {
          const res = db.exec(sql)
          const rows = rowsFromExec(res)
          postMessage({ type: 'result', sql, rows, context })
        }
      } catch (e) {
        postMessage({ type: 'error', text: 'exec failed: ' + String(e) })
      }
    }
  } catch (err) {
    postMessage({ type: 'error', text: String(err) })
  }
})
