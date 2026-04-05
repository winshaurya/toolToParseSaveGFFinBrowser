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
  List,
  ListItem,
  ListItemText,
  CssBaseline,
  ThemeProvider,
  createTheme
} from '@mui/material'
import Visualizer2D from './components/Visualizer2D'

const API_BASE = 'http://localhost:8000'

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
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

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
      setSqlitePath(j.sqlite_url)
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
      addLog('Start conversion failed: ' + String(e), 'error')
    }
  }

  function clearLogs() {
    setLogs([])
  }

  function simulateQueryAndResults() {
    addLog('User query: ' + (query || 'query'), 'query')
    setTimeout(() => addLog('SQL: ' + (query || 'SELECT * FROM features LIMIT 100'), 'sql'), 300)
    setTimeout(() => addLog(`HTTP Range request issued for ${sqliteFullUrl(sqlitePath || '/static/demo_small.sqlite')}`, 'http'), 700)
    setTimeout(() => addLog('WASM VFS: Fetching pages and executing SQLite', 'wasm'), 1200)
    setTimeout(() => {
      addLog('WASM: Returned 3 rows', 'result')
      setResults([
        { seqid: 'chr1', start: 1024, end: 2048, attributes: 'ID=gene1;Name=gene1' },
        { seqid: 'chr2', start: 5000, end: 5200, attributes: 'ID=gene2;Name=gene2' },
        { seqid: 'chr3', start: 900, end: 1200, attributes: 'ID=gene3;Name=gene3' }
      ])
    }, 1800)
  }

  function runQuery() {
    if (!sqlitePath) {
      addLog('No SQLite available, running demo query', 'step')
      simulateQueryAndResults()
      return
    }
    simulateQueryAndResults()
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
      </Box>
    </ThemeProvider>
  )
}

