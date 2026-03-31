import React, { useState, useRef } from 'react'
import ControlPanel from './components/ControlPanel'
import VisualLog from './components/VisualLog'
import JBrowseView from './components/JBrowseView'

export default function App() {
  const [logs, setLogs] = useState<string[]>([])
  const addLog = (s: string) => setLogs(l => [...l, s])

  return (
    <div className="app">
      <div className="left">
        <ControlPanel addLog={addLog} />
        <div style={{ marginTop: 12 }}>
          <JBrowseView />
        </div>
      </div>
      <div className="right">
        <VisualLog logs={logs} />
      </div>
    </div>
  )
}
