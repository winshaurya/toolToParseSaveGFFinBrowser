import React from 'react'

export default function JBrowseView({ center }: { center?: { seqid: string; start: number; end: number } }) {
  return (
    <div style={{ padding: 12, background: '#031014', color: '#bfeafc', borderRadius: 6 }}>
      <h4>Mock JBrowse View</h4>
      {center ? (
        <div>
          Centered at: <strong>{center.seqid}</strong> : {center.start} - {center.end}
        </div>
      ) : (
        <div>Awaiting coordinates...</div>
      )}
    </div>
  )
}
