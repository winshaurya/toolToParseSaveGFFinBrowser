import React, { useState, useRef } from 'react'
import ControlPanel from './components/ControlPanel'
import VisualLog from './components/VisualLog'
import JBrowseView from './components/JBrowseView'

export default function App() {
  const [logs, setLogs] = useState<string[]>([])
  const [center, setCenter] = useState<{ seqid: string; start: number; end: number } | undefined>(undefined)
  const addLog = (s: string) => setLogs(l => [...l, s])

  return (
    <div className="app">
      <div className="left">
        <ControlPanel addLog={addLog} setCenter={setCenter} />
        <div style={{ marginTop: 12 }}>
          <JBrowseView center={center} />
        </div>
      </div>
      <div className="right">
        <VisualLog logs={logs} />
      </div>
    </div>
  )
}
