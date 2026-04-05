import React, { useEffect, useRef, useState } from 'react';
import WasmSqliteDB from '../wasm/sqlite_wasm_loader.js';

const styles = {
  container: { maxWidth: 980, margin: '18px auto', fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' },
  header: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid #d0d7de', minWidth: 120 },
  button: { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0366d6', color: '#fff', cursor: 'pointer' },
  smallButton: { padding: '6px 10px', borderRadius: 8, border: 'none', background: '#238636', color: '#fff', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: 12 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e1e4e8', background: '#fafbfc' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f1f3f5' },
  spinner: { marginLeft: 8, color: '#666' },
  attributes: { fontFamily: 'monospace', fontSize: 13, color: '#333' }
};

export default function GenomicSearch({ dbUrl = null, wasmURL = '/sql-wasm.wasm', initSqlJs = null }) {
  const loaderRef = useRef(null);
  const [runtimeInitializing, setRuntimeInitializing] = useState(true);
  const [dbLoading, setDbLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);

  const [seqid, setSeqid] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [attributeName, setAttributeName] = useState('');
  const [attributeValue, setAttributeValue] = useState('');

  useEffect(() => {
    loaderRef.current = new WasmSqliteDB({ wasmURL, initSqlJs });
    let mounted = true;

    (async () => {
      try {
        setRuntimeInitializing(true);
        await loaderRef.current.init(initSqlJs);
        setRuntimeInitializing(false);
        if (dbUrl) {
          setDbLoading(true);
          await loaderRef.current.loadDatabaseFromUrl(dbUrl);
          setDbLoading(false);
          if (mounted) setReady(true);
        }
      } catch (err) {
        setRuntimeInitializing(false);
        setDbLoading(false);
        setError(err?.message || String(err));
      }
    })();

    return () => {
      mounted = false;
      try {
        loaderRef.current?.close();
      } catch (e) {
        // ignore
      }
    };
  }, [dbUrl, wasmURL, initSqlJs]);

  async function handleFileLoad(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setError(null);
    setDbLoading(true);
    try {
      await loaderRef.current.loadDatabaseFromFile(f);
      setReady(true);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setDbLoading(false);
    }
  }

  async function handleLoadFromUrl() {
    if (!dbUrl) return;
    setError(null);
    setDbLoading(true);
    try {
      await loaderRef.current.loadDatabaseFromUrl(dbUrl);
      setReady(true);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setDbLoading(false);
    }
  }

  async function handleSearch(e) {
    if (e) e.preventDefault();
    setError(null);
    setResults([]);
    if (!ready) {
      setError('Database not loaded yet.');
      return;
    }
    if (!seqid) {
      setError('Please provide a seqid (e.g., chr1).');
      return;
    }
    const s = Number(start || 0);
    const en = Number(end || 0);
    if (!Number.isInteger(s) || !Number.isInteger(en) || s < 0 || en < 0) {
      setError('Start and end must be non-negative integers.');
      return;
    }
    setQueryLoading(true);
    try {
      const resp = await loaderRef.current.queryFeatures({ seqid, start: s, end: en, attributeName: attributeName || null });
      let filtered = resp;
      if (attributeName && attributeValue) {
        const keyLower = attributeName.toLowerCase();
        const valLower = attributeValue.toLowerCase();
        filtered = resp.filter(f => f.attributes && f.attributes.some(a => a.key && a.key.toLowerCase() === keyLower && String(a.value || '').toLowerCase().includes(valLower)));
      }
      setResults(filtered);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setQueryLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Genomic Feature Search</h3>
        <div>
          {runtimeInitializing && <span style={styles.spinner}>Initializing WASM runtime…</span>}
          {dbLoading && <span style={styles.spinner}>Loading DB…</span>}
          {ready && <span style={{ color: '#2ea44f' }}>DB ready</span>}
        </div>
      </div>

      <form onSubmit={handleSearch} style={styles.header}>
        <input style={styles.input} placeholder="seqid (e.g., chr1)" value={seqid} onChange={e => setSeqid(e.target.value)} />
        <input style={styles.input} placeholder="start" type="number" value={start} onChange={e => setStart(e.target.value)} />
        <input style={styles.input} placeholder="end" type="number" value={end} onChange={e => setEnd(e.target.value)} />
        <input style={styles.input} placeholder="attribute name (e.g., Name)" value={attributeName} onChange={e => setAttributeName(e.target.value)} />
        <input style={styles.input} placeholder="optional attribute value" value={attributeValue} onChange={e => setAttributeValue(e.target.value)} />
        <button style={styles.button} type="submit" disabled={!ready || queryLoading}>{queryLoading ? 'Searching…' : 'Search'}</button>
        <input type="file" accept=".db" onChange={handleFileLoad} style={{ marginLeft: 8 }} />
        {dbUrl && !ready && <button type="button" style={styles.smallButton} onClick={handleLoadFromUrl}>Load DB from URL</button>}
      </form>

      {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>ID</th>
            <th style={styles.th}>Type</th>
            <th style={styles.th}>Location</th>
            <th style={styles.th}>Length</th>
            <th style={styles.th}>Attributes</th>
          </tr>
        </thead>
        <tbody>
          {results.length === 0 && (
            <tr><td style={styles.td} colSpan={5}>No results</td></tr>
          )}
          {results.map(row => (
            <tr key={row.id}>
              <td style={styles.td}>{row.id}</td>
              <td style={styles.td}>{row.type}</td>
              <td style={styles.td}>{row.start} - {row.end} ({row.seqname})</td>
              <td style={styles.td}>{row.length}</td>
              <td style={styles.td}><div style={styles.attributes}>{(row.attributes || []).map(a => `${a.key}=${a.value}`).join('; ')}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
