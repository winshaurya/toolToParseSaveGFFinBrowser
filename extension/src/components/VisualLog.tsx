import React from 'react'

export default function VisualLog({ logs }: { logs: string[] }) {
  return (
    <div className="visual">
      <h3>Engine View</h3>
      <div className="terminal">
        {logs.map((l, i) => (
          <div key={i} className="log">{l}</div>
        ))}
      </div>
    </div>
  )
}
