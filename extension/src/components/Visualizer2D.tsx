import React, { useEffect, useRef, useState } from 'react'

type LogItem = { text: string; type?: string }

interface VisualizerProps {
  progress: number
  status?: string | null
  logs: LogItem[]
}

export default function Visualizer2D({ progress, status, logs }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const requestRef = useRef<number | null>(null)
  const positionRef = useRef<number>(0)
  const [x, setX] = useState(0)

  useEffect(() => {
    function handleResize() {
      // keep visual responsive; no-op here, but ResizeObserver could be added if needed
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    let last = performance.now()
    const animate = (now: number) => {
      const dt = now - last
      last = now
      if (status === 'running' || status === 'pending') {
        positionRef.current = (positionRef.current + dt * 0.12) % 1000
        setX(positionRef.current)
      } else {
        const target = (progress / 100) * 900
        positionRef.current += (target - positionRef.current) * 0.08
        setX(positionRef.current)
      }
      requestRef.current = requestAnimationFrame(animate)
    }
    requestRef.current = requestAnimationFrame(animate)
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [status, progress])

  const lastLog = logs && logs.length ? logs[logs.length - 1].text : ''
  const color = status === 'failed' ? '#e53935' : status === 'done' ? '#43a047' : '#1e88e5'

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <svg ref={svgRef} viewBox="0 0 1000 200" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
        <rect x={0} y={0} width={1000} height={200} rx={6} fill="#000" opacity={0.02} />
        <rect x={20} y={80} width={960} height={40} rx={8} fill="#cfd8dc" opacity={0.08} />

        <rect x={Math.max(10, Math.min(920, x))} y={70} width={80} height={60} rx={8} fill={color} />

        <text x={24} y={33} fill="#222" fontSize={16} fontFamily="Inter, Arial, sans-serif">
          Status: {status || 'idle'}
        </text>
        <text x={24} y={52} fill="#555" fontSize={12} fontFamily="Inter, Arial, sans-serif" style={{ whiteSpace: 'pre-wrap' }}>
          {lastLog}
        </text>

        <text x={880} y={30} fill="#666" fontSize={12} fontFamily="Inter, Arial, sans-serif">Progress: {Math.round(progress)}%</text>
      </svg>
    </div>
  )
}
