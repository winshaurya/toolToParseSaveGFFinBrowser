import React, { useState } from 'react'
import '../cd extension
npm ci
npm run build.css'

export default function ControlPanel({ addLog, setCenter }: { addLog: (s: any) => void; setCenter: (c: { seqid: string; start: number; end: number } | undefined) => void }) {
  const [url, setUrl] = useState('http://localhost:8000/static/db_fd6d0b03e61841a28d4c53a0683bd452.sqlite')
  const [query, setQuery] = useState('SELECT seqid, start, end, attributes FROM features WHERE featuretype = "gene" LIMIT 10;')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function runQuery() {
    setLoading(true)
    addLog({ type: 'info', text: 'Running query…' })
    // If the URL points to a GFF, request backend conversion and poll status
    let dbUrl = url
    try {
      if (url.endsWith('.gff') || url.includes('/merged_gff/')) {
        addLog({ type: 'info', text: 'Posting GFF URL to backend /convert' })
        const resp = await fetch('http://localhost:8000/convert', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gff_url: url })
        })
        const j = await resp.json()
        addLog({ type: 'info', text: 'Conversion started' })
        const jobId = j.job_id
        const start = Date.now()
        while (Date.now() - start < 1000 * 60 * 10) {
          await new Promise(r => setTimeout(r, 2000))
          const s = await fetch(`http://localhost:8000/status/${jobId}`)
          const info = await s.json()
          addLog({ type: 'info', text: 'Job: ' + info.status })
          if (info.status === 'done') {
            dbUrl = (info.sqlite_url.startsWith('/') ? 'http://localhost:8000' + info.sqlite_url : info.sqlite_url)
            break
          }
          if (info.status === 'failed') {
            addLog({ type: 'error', text: 'Conversion failed: ' + (info.error || 'unknown') })
            setLoading(false)
            return
          }
        }
      }
    } catch (err) {
      addLog({ type: 'error', text: 'Error starting conversion: ' + String(err) })
      setLoading(false)
      return
    }

    addLog({ type: 'info', text: 'Spawning wasm worker...' })
    // Load worker from public path so it is available in production builds
    const worker = new Worker('/wasmWorker.js')
    worker.addEventListener('message', (ev) => {
      const m = ev.data
      if (m.type === 'log') addLog({ type: 'info', text: m.text })
      if (m.type === 'error') addLog({ type: 'error', text: m.text })
      if (m.type === 'ready') addLog({ type: 'wasm', text: 'worker ready' })
      if (m.type === 'opened') addLog({ type: 'vfs', text: 'opened ' + m.url })
      if (m.type === 'result') {
        addLog({ type: 'result', text: `${(m.rows || []).length} rows` })
        setResults(m.rows || [])
        setLoading(false)
        if (Array.isArray(m.rows) && m.rows.length > 0) {
          const r = m.rows[0]
          const seqid = r.seqid || r.chrom || r.chromosome || r.contig
          const start = r.start || r.begin || r.pos || 0
          const end = r.end || r.stop || (r.start ? r.start + 100 : 100)
          setCenter({ seqid, start: Number(start), end: Number(end) })
        }
      }
    })

    worker.postMessage({ type: 'init' })
    addLog({ type: 'info', text: 'Opening DB at ' + dbUrl })
    worker.postMessage({ type: 'open', url: dbUrl })
    worker.postMessage({ type: 'exec', sql: query })
  }

  return (
    <div className="card app-shell">
      <div className="flex gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Query Console</h3>
            <div className="text-sm text-slate-400">Fast, local SQL via WASM</div>
          </div>

          <label className="block mt-4 text-sm text-slate-300">SQLite URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} className="w-full mt-1 p-2 rounded-md bg-slate-900 border border-slate-700 text-sm" />

          <label className="block mt-3 text-sm text-slate-300">SQL</label>
          <textarea value={query} onChange={e => setQuery(e.target.value)} rows={5} className="w-full mt-1 p-3 rounded-lg bg-slate-900 border border-slate-700 text-sm mono" />

          <div className="mt-3 flex items-center gap-3">
            <button className="btn-primary" onClick={runQuery} disabled={loading}>{loading ? 'Running…' : 'Run Query'}</button>
            <button className="px-3 py-2 rounded-md border border-slate-700 text-sm text-slate-200" onClick={() => { setResults([]); addLog({ type: 'info', text: 'Cleared results' }) }}>Clear</button>
          </div>
        </div>

        <div className="w-96">
          <div className="text-sm text-slate-300 mb-2">Results</div>
          <div className="h-64 overflow-auto rounded-md bg-slate-900 border border-slate-700 p-2">
            {results.length === 0 && (<div className="text-sm text-slate-500">No results yet</div>)}
            {results.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs"><th className="text-left">seqid</th><th className="text-left">start</th><th className="text-left">end</th></tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-800/40 cursor-pointer" onClick={() => {
                      const seqid = r.seqid || r.chrom || r.chromosome || r.contig
                      const start = r.start || r.begin || r.pos || 0
                      const end = r.end || r.stop || (r.start ? r.start + 100 : 100)
                      setCenter({ seqid, start: Number(start), end: Number(end) })
                    }}>
                      <td className="py-1 align-top">{r.seqid || r.chrom || r.chromosome || r.contig}</td>
                      <td className="py-1 align-top">{r.start || r.begin || r.pos || ''}</td>
                      <td className="py-1 align-top">{r.end || r.stop || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm text-slate-300 mb-2">Activity Log</div>
        <div className="card">
          <div className="p-2">
            {/* VisualLog will read from global log store */}
            <div className="text-sm text-slate-400">Open the Visual Log panel to see range & SQL activity.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
