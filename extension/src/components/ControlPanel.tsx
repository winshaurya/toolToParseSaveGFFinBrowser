import React, { useState } from 'react'

export default function ControlPanel({ addLog, setCenter }: { addLog: (s: string) => void; setCenter: (c: { seqid: string; start: number; end: number } | undefined) => void }) {
  const [url, setUrl] = useState('http://localhost:8000/static/db_fd6d0b03e61841a28d4c53a0683bd452.sqlite')
  const [query, setQuery] = useState('SELECT seqid, start, end, attributes FROM features WHERE featuretype = "gene" LIMIT 10;')

  async function runQuery() {
    addLog('User query: ' + query)
    addLog('Generated SQL: ' + query)

    // Start worker and request it to open the DB URL then execute SQL
    addLog('Spawning wasm worker...')
    const worker = new Worker('/src/wasmWorker.js')
    worker.addEventListener('message', (ev) => {
      const m = ev.data
      if (m.type === 'log') addLog('[worker] ' + m.text)
      if (m.type === 'error') addLog('[worker:error] ' + m.text)
      if (m.type === 'ready') addLog('[worker] ready')
      if (m.type === 'opened') addLog('[worker] opened ' + m.url)
      if (m.type === 'result') {
        addLog('[worker] result: ' + JSON.stringify(m.rows))
        // pick first row to center JBrowseView
        if (Array.isArray(m.rows) && m.rows.length > 0) {
          const r = m.rows[0]
          // attempt to map common fields
          const seqid = r.seqid || r.chrom || r.chromosome || r.contig
          const start = r.start || r.begin || r.pos || 0
          const end = r.end || r.stop || (r.start ? r.start + 100 : 100)
          setCenter({ seqid, start: Number(start), end: Number(end) })
        }
      }
    })

    // initialize (optional)
    worker.postMessage({ type: 'init' })
    // open the remote sqlite URL (worker currently simulates open)
    worker.postMessage({ type: 'open', url })
    // trigger exec
    worker.postMessage({ type: 'exec', sql: query })
  }

  return (
    <div className="control">
      <h3>Control Panel</h3>
      <label>SQLite URL</label>
      <input value={url} onChange={e => setUrl(e.target.value)} />
      <label>Query</label>
      <textarea value={query} onChange={e => setQuery(e.target.value)} rows={4} />
      <button onClick={runQuery}>Run</button>
    </div>
  )
}
