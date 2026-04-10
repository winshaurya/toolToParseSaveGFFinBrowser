import React, { useEffect, useRef, useState } from 'react'
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Grid,
  Paper,
  TextField,
  Button,
  LinearProgress,
  Box,
  Switch,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CssBaseline,
  ThemeProvider,
  createTheme
} from '@mui/material'
import Visualizer2D from './components/Visualizer2D'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { IconButton, Tooltip, Divider, Chip, Stack } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import TableChartIcon from '@mui/icons-material/TableChart'

const API_BASE = (import.meta as any)?.env?.VITE_API_BASE || 'http://localhost:8000'

function sanitizeText(text: string) {
  if (!text) return ''
  return text.replace(/-{2,}/g, ' ').replace(/—/g, ' ').trim()
}

export default function App() {
  const [gffUrl, setGffUrl] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [sqlitePath, setSqlitePath] = useState<string | null>(null)
  const [logs, setLogs] = useState<Array<{ text: string; type?: string }>>([])
  const [progress, setProgress] = useState<number>(0)
  const [query, setQuery] = useState('SELECT * FROM features LIMIT 100')
  const [results, setResults] = useState<Array<any>>([])
  const [darkMode, setDarkMode] = useState(false)
  const [dbSchema, setDbSchema] = useState<any | null>(null)
  const [dbLoader, setDbLoader] = useState<any | null>(null)
  const [pendingSqliteUrl, setPendingSqliteUrl] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const pollRef = useRef<number | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tablePreviewLimit, setTablePreviewLimit] = useState<number>(50)
  const [previewRows, setPreviewRows] = useState<any[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [tableViewerOpen, setTableViewerOpen] = useState(false)
  const [tableViewerTable, setTableViewerTable] = useState<string | null>(null)
  const [tableViewerRows, setTableViewerRows] = useState<any[]>([])
  const [tableViewerPage, setTableViewerPage] = useState<number>(0)
  const [tableViewerPageSize, setTableViewerPageSize] = useState<number>(100)
  const [tableViewerTotal, setTableViewerTotal] = useState<number | null>(null)
  const [tableViewerLoading, setTableViewerLoading] = useState<boolean>(false)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    let loader: any = null
    let worker: Worker | null = null
    if (!sqlitePath) {
      setDbSchema(null)
      return
    }

    (async () => {
      try {
        addLog('DB Explorer: initializing worker', 'wasm')

            if (typeof Worker !== 'undefined') {
          try {
            // Load the worker via a public URL to avoid Vite attempting to
            // bundle it as a module worker. The worker file is copied to
            // the dist root via `public/wasmWorker.js`.
            worker = new Worker('/wasmWorker.js')
            workerRef.current = worker

            let pendingPragmas = 0
            let tablesAcc: Array<any> = []

            worker.onmessage = async (ev: MessageEvent) => {
              const d = ev.data
              if (d.type === 'log') addLog('Worker: ' + d.text, 'wasm')
              if (d.type === 'error') {
                addLog('Worker error: ' + d.text, 'error')
                // If the worker clearly cannot initialize the sqlite runtime or
                // open the DB, terminate it and fall back to the in-page full-file loader.
                const txt = String(d.text || '').toLowerCase()
                if (txt.includes('no suitable runtime') || txt.includes('no sqlite init function') || txt.includes('failed to initialize sqlite runtime') || txt.includes('no db opened') || txt.includes('open failed') || txt.includes('http vfs not registered')) {
                  addLog('Worker appears unusable; falling back to full-file loader', 'wasm')
                  try {
                    if (workerRef.current) {
                      try { workerRef.current.terminate() } catch (e) {}
                      workerRef.current = null
                    }
                    // initialize the in-page loader identical to the fallback path
                    const mod = await import('./wasm/sqlite_wasm_loader.js')
                    const WasmSqlite = (mod && (mod.default || mod.WasmSqliteDB)) || mod
                    loader = new WasmSqlite({ wasmURL: '/sql-wasm.wasm' })
                    await loader.init()
                    await loader.loadDatabaseFromUrl(sqliteFullUrl(sqlitePath))
                    setDbLoader(loader)

                    const tablesRes = loader.db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view')")
                    const tables = []
                    if (tablesRes && tablesRes[0] && tablesRes[0].values) {
                      for (const row of tablesRes[0].values) {
                        const name = row[0]
                        const type = row[1]
                        const colsRes = loader.db.exec(`PRAGMA table_info("${name}")`)
                        const columns = (colsRes && colsRes[0] && colsRes[0].values)
                          ? colsRes[0].values.map((c: any) => ({ name: c[1], type: c[2], pk: c[5] }))
                          : []
                        tables.push({ name, type, columns })
                      }
                    }
                    setDbSchema({ tables })
                    addLog('DB Explorer: found ' + tables.length + ' tables (fallback after worker error)', 'success')
                  } catch (fe) {
                    addLog('Fallback loader failed: ' + String(fe), 'error')
                  }
                }
              }
              if (d.type === 'ready') addLog('Worker ready (vfs=' + String(d.vfs) + ')', 'wasm')
              if (d.type === 'opened') addLog('Worker opened DB: ' + d.url, 'wasm')
              if (d.type === 'result') {
                  // Table viewer: count responses
                  if (d.context === 'table-count') {
                    const rows = d.rows || []
                    let cnt: number | null = null
                    if (rows && rows[0]) {
                      const r0 = rows[0]
                      if (typeof r0.cnt !== 'undefined') cnt = Number(r0.cnt)
                      else {
                        const k = Object.keys(r0)[0]
                        if (k) cnt = Number((r0 as any)[k])
                      }
                    }
                    setTableViewerTotal(cnt)
                    setTableViewerLoading(false)
                    return
                  }

                  // Table viewer: page rows
                  if (d.context === 'table-view') {
                    setTableViewerRows(d.rows || [])
                    setTableViewerLoading(false)
                    return
                  }

                  // preview results take precedence via explicit context
                  if (d.context === 'preview') {
                    setPreviewRows(d.rows || [])
                    return
                  }

                  // distinguish table list vs pragma responses by the SQL text
                  const sql = (d.sql || '').trim()
                if (sql.toLowerCase().startsWith("select name, type from sqlite_master")) {
                  const rows = d.rows || []
                  tablesAcc = rows.map((r: any) => ({ name: r.name, type: r.type, columns: [] }))
                  if (tablesAcc.length === 0) {
                    setDbSchema({ tables: [] })
                    return
                  }
                  pendingPragmas = tablesAcc.length
                  // request PRAGMA for each table
                  for (const t of tablesAcc) {
                    worker?.postMessage({ type: 'exec', sql: `PRAGMA table_info("${t.name}")` })
                  }
                } else if (sql.toLowerCase().startsWith('pragma table_info')) {
                  const rows = d.rows || []
                  // extract table name from pragma SQL
                  const m = sql.match(/PRAGMA table_info\("?(.*?)"?\)/i)
                  const tableName = m ? m[1] : null
                  const cols = rows.map((r: any) => ({ name: r.name || r.column || r[1], type: r.type || r[2], pk: r.pk || r[5] }))
                  const t = tablesAcc.find((x: any) => x.name === tableName)
                  if (t) t.columns = cols
                  pendingPragmas -= 1
                  if (pendingPragmas <= 0) {
                    setDbSchema({ tables: tablesAcc })
                    addLog('DB Explorer: found ' + tablesAcc.length + ' tables (worker)', 'success')
                  }
                } else {
                  // generic query result displayed in Results pane
                  if (d.rows && Array.isArray(d.rows)) setResults(d.rows)
                }
              }
            }

            // init worker: prefer bootstrapper in public/sqlite
            worker.postMessage({ type: 'init', sqliteWasmUrl: '/sqlite/worker-bootstrap.js' })
            // once ready the worker will signal and we'll open the DB; to keep
            // it simple we also attempt to open immediately (worker will queue)
            worker.postMessage({ type: 'open', url: sqliteFullUrl(sqlitePath) })
            // ask for table list (worker may handle it after opened)
            worker.postMessage({ type: 'exec', sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table','view')" })
            return
          } catch (we) {
            addLog('Worker spawn failed, falling back: ' + String(we), 'error')
          }
        }

        // Fallback: use in-page full-file loader
        addLog('DB Explorer: initializing runtime (full-file fallback)', 'wasm')
        const mod = await import('./wasm/sqlite_wasm_loader.js')
        const WasmSqlite = (mod && (mod.default || mod.WasmSqliteDB)) || mod
        loader = new WasmSqlite({ wasmURL: '/sql-wasm.wasm' })
        await loader.init()
        await loader.loadDatabaseFromUrl(sqliteFullUrl(sqlitePath))
        setDbLoader(loader)

        const tablesRes = loader.db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view')")
        const tables = []
        if (tablesRes && tablesRes[0] && tablesRes[0].values) {
          for (const row of tablesRes[0].values) {
            const name = row[0]
            const type = row[1]
            const colsRes = loader.db.exec(`PRAGMA table_info("${name}")`)
            const columns = (colsRes && colsRes[0] && colsRes[0].values)
              ? colsRes[0].values.map((c: any) => ({ name: c[1], type: c[2], pk: c[5] }))
              : []
            tables.push({ name, type, columns })
          }
        }
        setDbSchema({ tables })
        addLog('DB Explorer: found ' + tables.length + ' tables (fallback)', 'success')
      } catch (err: any) {
        addLog('DB Explorer load failed: ' + String(err), 'error')
        setDbSchema(null)
        if (loader && loader.close) loader.close()
      }
    })()

    return () => {
      if (loader && loader.close) loader.close()
      if (workerRef.current) {
        try { workerRef.current.terminate() } catch (e) {}
        workerRef.current = null
      }
    }
  }, [sqlitePath])

  function addLog(text: string, type = 'info') {
    const clean = sanitizeText(text)
    setLogs((l) => [...l, { text: clean, type }])
  }

  function sqliteFullUrl(path: string) {
    if (!path) return ''
    if (path.startsWith('/')) return API_BASE + path
    if (path.startsWith('http')) return path
    return API_BASE + path
  }

  async function startConversion() {
    if (!gffUrl) {
      addLog('Please enter a GFF URL', 'error')
      return
    }
    addLog(`Posting GFF URL to backend: ${gffUrl}`)
    try {
      const r = await fetch(`${API_BASE}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gff_url: gffUrl })
      })
      if (!r.ok) throw new Error('server error')
      const j = await r.json()
      setJobId(j.job_id)
      // do not set sqlitePath until conversion completes and file exists
      setPendingSqliteUrl(j.sqlite_url)
      setStatus('started')
      setProgress(5)
      addLog('Conversion job started: ' + j.job_id)

      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = window.setInterval(async () => {
        try {
          const s = await fetch(`${API_BASE}/status/${j.job_id}`)
          if (!s.ok) throw new Error('status fetch failed')
          const info = await s.json()
          setStatus(info.status)
          if (info.status === 'pending') {
            addLog('Job queued on server', 'step')
            setProgress((p) => Math.min(50, p + 8))
          }
          if (info.status === 'running') {
            addLog('Server conversion running', 'step')
            setProgress((p) => Math.min(90, p + 15))
          }
          if (info.status === 'done') {
            addLog('Conversion complete: ' + info.sqlite_url, 'success')
            setProgress(100)
            setJobId(null)
            // only set the public sqlite path once the file should exist on disk
            setSqlitePath(info.sqlite_url)
            setPendingSqliteUrl(null)
            if (pollRef.current) clearInterval(pollRef.current)
          }
          if (info.status === 'failed') {
            addLog('Conversion failed: ' + (info.error || 'unknown'), 'error')
            setProgress(0)
            setJobId(null)
            if (pollRef.current) clearInterval(pollRef.current)
          }
        } catch (e: any) {
          addLog('Status poll error: ' + String(e), 'error')
        }
      }, 1500)
    } catch (e: any) {
      addLog('Start conversion failed: ' + String(e), 'error')
    }
  }

  async function uploadAndConvertFile(file: any) {
    addLog('Uploading file: ' + (file.name || 'file'), 'step')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd })
      if (!r.ok) throw new Error('upload failed')
      const j = await r.json()
      setJobId(j.job_id)
      setSqlitePath(j.sqlite_url)
      setStatus('started')
      setProgress(5)
      addLog('Upload conversion started: ' + j.job_id, 'success')

      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = window.setInterval(async () => {
        try {
          const s = await fetch(`${API_BASE}/status/${j.job_id}`)
          if (!s.ok) throw new Error('status fetch failed')
          const info = await s.json()
          setStatus(info.status)
          if (info.status === 'pending') setProgress((p) => Math.min(50, p + 8))
          if (info.status === 'running') setProgress((p) => Math.min(90, p + 15))
          if (info.status === 'done') {
            setProgress(100)
            setJobId(null)
            setSqlitePath(info.sqlite_url)
            if (pollRef.current) clearInterval(pollRef.current)
          }
          if (info.status === 'failed') {
            addLog('Conversion failed: ' + (info.error || 'unknown'), 'error')
            setProgress(0)
            setJobId(null)
            if (pollRef.current) clearInterval(pollRef.current)
          }
        } catch (e: any) {
          addLog('Status poll error: ' + String(e), 'error')
        }
      }, 1500)
    } catch (e: any) {
      addLog('Upload failed: ' + String(e), 'error')
    }
  }

  function clearLogs() {
    setLogs([])
  }

  function simulateQueryAndResults() {
    // Demo mode disabled: surface an error instead of returning fake rows
    addLog('Demo results disabled. No SQLite DB available to run query.', 'error')
    setResults([])
  }

  function runQuery() {
    if (!sqlitePath) {
      addLog('No SQLite available; convert a GFF and wait for the job to finish before querying', 'error')
      setResults([])
      return
    }

    // If a worker is available, execute the query in the worker (stream/HTTP-VFS)
    const w = workerRef.current
    if (w) {
      addLog('Dispatching SQL to worker', 'query')
      w.postMessage({ type: 'exec', sql: query })
      return
    }

    // Otherwise fall back to client full-file loader
    if (dbLoader && dbLoader.db) {
      addLog('Running query in-page (full-file)', 'query')
      try {
        const res = dbLoader.db.exec(query)
        const rows = []
        if (res && res[0] && res[0].values) {
          const cols = res[0].columns
          for (const r of res[0].values) {
            const obj: any = {}
            for (let i = 0; i < cols.length; i++) obj[cols[i]] = r[i]
            rows.push(obj)
          }
        }
        setResults(rows)
        addLog('Query returned ' + rows.length + ' rows', 'result')
      } catch (e: any) {
        addLog('Query failed: ' + String(e), 'error')
      }
      return
    }

    simulateQueryAndResults()
  }

  async function handlePreview(tableName: string) {
    const sql = `SELECT * FROM "${tableName}" LIMIT ${tablePreviewLimit}`
    setQuery(sql)
    addLog('Preview: ' + sql, 'info')
    setPreviewRows(null)

    // Use worker if available (prefer HTTP-VFS / streaming)
    const w = workerRef.current
    if (w) {
      w.postMessage({ type: 'exec', sql, context: 'preview' })
      return
    }

    // Fallback to in-page loader
    if (dbLoader && dbLoader.db) {
      try {
        const res = dbLoader.db.exec(sql)
        const rows: any[] = []
        if (res && res[0] && res[0].values) {
          const cols = res[0].columns
          for (const r of res[0].values) {
            const obj: any = {}
            for (let i = 0; i < cols.length; i++) obj[cols[i]] = r[i]
            rows.push(obj)
          }
        }
        setPreviewRows(rows)
        addLog('Preview returned ' + rows.length + ' rows', 'result')
      } catch (err: any) {
        addLog('Preview failed: ' + String(err), 'error')
      }
      return
    }

    addLog('No DB available for preview; convert a GFF and wait for completion', 'error')
  }

  function toCSV(rows: any[]) {
    if (!rows || rows.length === 0) return ''
    const cols = Object.keys(rows[0])
    const lines = [cols.join(',')]
    for (const r of rows) {
      const vals = cols.map((c) => {
        const v = r[c]
        return typeof v === 'string' ? JSON.stringify(v) : String(v ?? '')
      })
      lines.push(vals.join(','))
    }
    return lines.join('\n')
  }

  async function loadTablePage(pageNumber: number, pageSize?: number, tableName?: string) {
    const tbl = tableName || tableViewerTable
    if (!tbl) return
    const size = pageSize || tableViewerPageSize
    const offset = pageNumber * size
    const sql = `SELECT * FROM "${tbl}" LIMIT ${size} OFFSET ${offset}`
    setTableViewerLoading(true)
    setTableViewerPage(pageNumber)

    const w = workerRef.current
    if (w) {
      w.postMessage({ type: 'exec', sql, context: 'table-view' })
      return
    }

    if (dbLoader && dbLoader.db) {
      try {
        const res = dbLoader.db.exec(sql)
        const rows: any[] = []
        if (res && res[0] && res[0].values) {
          const cols = res[0].columns
          for (const r of res[0].values) {
            const obj: any = {}
            for (let i = 0; i < cols.length; i++) obj[cols[i]] = r[i]
            rows.push(obj)
          }
        }
        setTableViewerRows(rows)
      } catch (e: any) {
        addLog('Table page load failed: ' + String(e), 'error')
      } finally {
        setTableViewerLoading(false)
      }
      return
    }

    simulateQueryAndResults()
    setTableViewerLoading(false)
  }

  async function openTableViewer(tableName: string) {
    setTableViewerTable(tableName)
    setTableViewerOpen(true)
    setTableViewerPage(0)
    setTableViewerRows([])
    setTableViewerTotal(null)
    setTableViewerLoading(true)

    // request total count and first page
    const w = workerRef.current
    if (w) {
      w.postMessage({ type: 'exec', sql: `SELECT COUNT(*) AS cnt FROM "${tableName}"`, context: 'table-count' })
      w.postMessage({ type: 'exec', sql: `SELECT * FROM "${tableName}" LIMIT ${tableViewerPageSize} OFFSET 0`, context: 'table-view' })
      return
    }

    if (dbLoader && dbLoader.db) {
      try {
        const cntRes = dbLoader.db.exec(`SELECT COUNT(*) AS cnt FROM "${tableName}"`)
        let cnt: number | null = null
        if (cntRes && cntRes[0] && cntRes[0].values && cntRes[0].values[0]) cnt = Number(cntRes[0].values[0][0])
        setTableViewerTotal(cnt)
      } catch (e: any) {
        addLog('Count failed: ' + String(e), 'error')
      }
      await loadTablePage(0, tableViewerPageSize, tableName)
    }
  }

  function closeTableViewer() {
    setTableViewerOpen(false)
    setTableViewerRows([])
    setTableViewerTable(null)
    setTableViewerTotal(null)
    setTableViewerPage(0)
    setTableViewerLoading(false)
  }

  function tableViewerPrev() {
    if (tableViewerPage > 0) loadTablePage(tableViewerPage - 1)
  }

  function tableViewerNext() {
    if (tableViewerTotal !== null) {
      const maxPage = Math.max(0, Math.ceil(tableViewerTotal / tableViewerPageSize) - 1)
      if (tableViewerPage >= maxPage) return
    }
    loadTablePage(tableViewerPage + 1)
  }

  function changeTableViewerPageSize(size: number) {
    setTableViewerPageSize(size)
    loadTablePage(0, size)
  }

  const theme = createTheme({ palette: { mode: darkMode ? 'dark' : 'light' } })

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        className="mobile-frame"
        sx={{
          width: { xs: '100%', sm: '375px' },
          height: '812px',
          maxHeight: '100vh',
          margin: '12px auto',
          borderRadius: 2,
          boxShadow: 3,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'background.paper'
        }}
      >
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Genomic Feature DB
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">Dark</Typography>
              <Switch checked={darkMode} onChange={() => setDarkMode((s) => !s)} />
            </Box>
          </Toolbar>
        </AppBar>

        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1 }}>
            <Grid container spacing={2} sx={{ height: '100%' }}>
              <Grid item xs={12}>
                <Paper sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="subtitle2">GFF URL</Typography>
                  <TextField
                    value={gffUrl}
                    onChange={(e) => setGffUrl(e.target.value)}
                    placeholder="https://.../annotations.gff"
                    fullWidth
                    size="small"
                    inputProps={{ style: { fontSize: 13 } }}
                  />
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" color="primary" onClick={startConversion} fullWidth>
                      Start
                    </Button>
                    <Button variant="outlined" onClick={() => fileInputRef.current?.click()}>
                      Upload
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".gff,.gff3,.gz" style={{ display: 'none' }} onChange={(e) => {
                      const f = e.target.files && e.target.files[0]
                      if (f) uploadAndConvertFile(f)
                    }} />
                    <Button variant="outlined" onClick={clearLogs}>
                      Clear
                    </Button>
                  </Box>

                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Progress
                    </Typography>
                    <LinearProgress variant="determinate" value={progress} sx={{ mt: 1 }} />
                    <Typography variant="caption" color="text.secondary" display="block">
                      {status || 'idle'}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Paper sx={{ p: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <TableChartIcon />
                    <Typography variant="subtitle2">Database Browser</Typography>
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption" color="text.secondary">{dbSchema ? `${dbSchema.tables?.length || 0} tables` : 'no DB'}</Typography>
                  </Box>

                  <Divider sx={{ mb: 1 }} />

                  {!dbSchema && <Typography color="text.secondary">No database loaded.</Typography>}
                  {dbSchema && (
                    <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                      <List dense sx={{ maxHeight: 120, overflow: 'auto' }}>
                        {dbSchema.tables.map((t: any) => (
                          <ListItem key={t.name} selected={selectedTable === t.name} onClick={() => setSelectedTable(t.name)} secondaryAction={(
                            <Stack direction="row" spacing={0.5}>
                              <Tooltip title="Preview rows">
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); handlePreview(t.name) }}>
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Open table viewer">
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); openTableViewer(t.name) }}>
                                  <TableChartIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Copy SELECT">
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); const sql = `SELECT * FROM \"${t.name}\" LIMIT ${tablePreviewLimit}`; navigator.clipboard?.writeText(sql); addLog('Copied SQL to clipboard', 'info'); setQuery(sql); }}>
                                  <ContentCopyIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          )}>
                            <ListItemText primary={t.name} secondary={`${t.columns?.length || 0} cols`} />
                          </ListItem>
                        ))}
                      </List>

                      {selectedTable && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption">Columns for {selectedTable}</Typography>
                          <List dense>
                            {(() => {
                              const t = dbSchema.tables.find((x: any) => x.name === selectedTable)
                              if (!t) return null
                              return t.columns.map((c: any) => (
                                <ListItem key={c.name}><ListItemText primary={`${c.name} — ${c.type || 'TEXT'}`} /></ListItem>
                              ))
                            })()}
                          </List>
                        </Box>
                      )}
                      {previewRows && previewRows.length > 0 && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption">Preview (first {tablePreviewLimit})</Typography>
                          <Box sx={{ maxHeight: 180, overflow: 'auto', mt: 0.5 }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  {Object.keys(previewRows[0]).map((c) => (
                                    <TableCell key={c}>{c}</TableCell>
                                  ))}
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {previewRows.map((r, i) => (
                                  <TableRow key={i} hover>
                                    {Object.keys(previewRows[0]).map((c) => (
                                      <TableCell key={c} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(r[c])}</TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </Box>
                          <Box sx={{ mt: 0.5, display: 'flex', gap: 1 }}>
                            <Button size="small" onClick={() => {
                              const csv = toCSV(previewRows)
                              const blob = new Blob([csv], { type: 'text/csv' })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = `${selectedTable || 'preview'}.csv`
                              a.click()
                              URL.revokeObjectURL(url)
                            }}>Download CSV</Button>
                            <Button size="small" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(previewRows)); addLog('Preview copied to clipboard', 'info') }}>Copy JSON</Button>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  )}

                </Paper>

                <Box sx={{ height: 8 }} />

                <Paper sx={{ p: 1 }}>
                  <Typography variant="subtitle2">SQL Query</Typography>
                  <TextField
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    fullWidth
                    multiline
                    minRows={4}
                    size="small"
                    sx={{ mt: 1 }}
                    inputProps={{ style: { fontFamily: 'Roboto Mono, monospace', fontSize: 13 } }}
                  />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="contained" color="primary" onClick={runQuery} fullWidth>
                      Run
                    </Button>
                    <Button variant="outlined" onClick={() => { setResults([]); addLog('Results cleared', 'info') }}>
                      Clear
                    </Button>
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
                <Paper sx={{ p: 1, flex: 2, display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2">Results</Typography>
                    <Typography variant="caption" color="text.secondary">{results.length} rows</Typography>
                  </Box>

                  <Box sx={{ overflow: 'auto', flex: 1 }}>
                    {results.length === 0 && <Typography color="text.secondary">No results yet.</Typography>}
                    {results.length > 0 && (
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>seqid</TableCell>
                            <TableCell>start</TableCell>
                            <TableCell>end</TableCell>
                            <TableCell>attributes</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {results.map((r, i) => (
                            <TableRow key={i} hover>
                              <TableCell>{r.seqid}</TableCell>
                              <TableCell>{r.start}</TableCell>
                              <TableCell>{r.end}</TableCell>
                              <TableCell style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.attributes}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </Box>
                </Paper>

                <Paper sx={{ p: 1, flex: 1, overflow: 'auto' }}>
                  <Typography variant="subtitle2">Database Explorer</Typography>
                  {!dbSchema && <Typography color="text.secondary">No database loaded.</Typography>}
                  {dbSchema && (
                    <Box>
                      {dbSchema.tables.map((t: any) => (
                        <Accordion key={t.name}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography>{t.name}</Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Typography variant="caption">Columns</Typography>
                            <List dense>
                              {t.columns.map((c: any) => (
                                <ListItem key={c.name}><ListItemText primary={`${c.name} (${c.type})`} /></ListItem>
                              ))}
                            </List>
                          </AccordionDetails>
                        </Accordion>
                      ))}
                    </Box>
                  )}
                </Paper>

                <Paper sx={{ p: 1, flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Activity Visualizer</Typography>
                  <Box sx={{ height: '100%', minHeight: 80 }}>
                    <Visualizer2D progress={progress} status={status} logs={logs.slice(-12)} />
                  </Box>
                </Paper>

                <Paper sx={{ p: 1, flex: 1, overflow: 'auto' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2">Engine Log</Typography>
                    <Typography variant="caption" color="text.secondary">{logs.length} events</Typography>
                  </Box>
                  <List dense>
                    {logs.length === 0 && <ListItem><ListItemText primary="No activity yet." /></ListItem>}
                    {logs.map((l, i) => (
                      <ListItem key={i}>
                        <ListItemText primary={l.text} secondary={new Date().toLocaleTimeString()} />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              </Grid>
            </Grid>
          </Box>
        </Box>
        <Dialog open={tableViewerOpen} onClose={closeTableViewer} maxWidth="lg" fullWidth>
          <DialogTitle>
            Table: {tableViewerTable}
            {tableViewerTotal !== null && (
              <Typography component="span" variant="caption" sx={{ ml: 2 }}>[{tableViewerTotal} rows]</Typography>
            )}
          </DialogTitle>
          <DialogContent dividers>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
              <Button size="small" variant="outlined" onClick={tableViewerPrev} disabled={tableViewerPage <= 0}>Prev</Button>
              <Typography variant="body2">Page {tableViewerPage + 1}</Typography>
              <Button size="small" variant="outlined" onClick={tableViewerNext} disabled={tableViewerTotal !== null && (tableViewerPage + 1) * tableViewerPageSize >= (tableViewerTotal || 0)}>Next</Button>
              <FormControl size="small" sx={{ ml: 2, minWidth: 100 }}>
                <InputLabel>Page size</InputLabel>
                <Select value={tableViewerPageSize} label="Page size" onChange={(e) => changeTableViewerPageSize(Number(e.target.value))}>
                  <MenuItem value={25}>25</MenuItem>
                  <MenuItem value={50}>50</MenuItem>
                  <MenuItem value={100}>100</MenuItem>
                  <MenuItem value={250}>250</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ flex: 1 }} />
              <Button size="small" onClick={() => {
                const csv = toCSV(tableViewerRows)
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${tableViewerTable || 'table'}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}>Export CSV</Button>
              <Button size="small" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(tableViewerRows)); addLog('Table rows copied to clipboard', 'info') }}>Copy JSON</Button>
            </Box>

            {tableViewerLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress /></Box>}

            {!tableViewerLoading && tableViewerRows.length === 0 && <Typography color="text.secondary">No rows to display.</Typography>}

            {!tableViewerLoading && tableViewerRows.length > 0 && (
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {Object.keys(tableViewerRows[0]).map((c) => (
                        <TableCell key={c}>{c}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableViewerRows.map((r, i) => (
                      <TableRow key={i} hover>
                        {Object.keys(tableViewerRows[0]).map((c) => (
                          <TableCell key={c} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(r[c])}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeTableViewer}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  )
}

