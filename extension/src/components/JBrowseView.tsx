import React from 'react'
import '../index.css'

export default function JBrowseView({ center }: { center?: { seqid: string; start: number; end: number } }) {
  return (
    <div className="card">
      <div className="p-4">
        <h4 className="text-sm font-semibold">Genome View</h4>
        <div className="mt-2 p-3 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200">
          {center ? (
            <div>
              Centered at: <strong className="text-white">{center.seqid}</strong> : {center.start} - {center.end}
            </div>
          ) : (
            <div className="text-slate-500">Awaiting coordinates...</div>
          )}
        </div>
      </div>
    </div>
  )
}
