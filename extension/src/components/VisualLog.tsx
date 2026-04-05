import React from 'react'
import '../index.css'

function LogLine({ item }: { item: { type: string; text: string } }) {
  const color = item.type === 'error' ? 'bg-red-600' : item.type === 'wasm' ? 'bg-amber-600' : 'bg-slate-600'
  return (
    <div className="flex items-start gap-3 py-1">
      <div className={`text-xs px-2 py-0.5 rounded ${color} text-white mono`}>{item.type}</div>
      <div className="text-sm text-slate-200 break-words">{item.text}</div>
    </div>
  )
}

export default function VisualLog({ logs }: { logs: Array<{ type: string; text: string }> }) {
  return (
    <div className="card">
      <div className="p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Engine View</h3>
          <div className="text-xs text-slate-400">Range + SQL activity</div>
        </div>

        <div className="mt-3 h-48 overflow-auto bg-slate-900 border border-slate-700 rounded-md p-2">
          {logs.length === 0 && <div className="text-sm text-slate-500">No activity yet</div>}
          {logs.map((l, i) => (
            <LogLine key={i} item={l} />
          ))}
        </div>
      </div>
    </div>
  )
}
