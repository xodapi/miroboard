import type { Dispatch, SetStateAction } from 'react'

type MiniMapElement = {
  id: string
  x: number
  y: number
  w?: number
  h?: number
  fill?: string
  color?: string
}

type Transform = { x: number; y: number; scale: number }

type Props = {
  elements: MiniMapElement[]
  transform: Transform
  darkMode: boolean
  setTransform: Dispatch<SetStateAction<Transform>>
}

export function MiniMap({ elements, transform, darkMode, setTransform }: Props) {
  if (elements.length === 0) return null
  const MW = 130, MH = 90
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
  elements.forEach(el => {
    mnx = Math.min(mnx, el.x); mny = Math.min(mny, el.y)
    mxx = Math.max(mxx, el.x + (el.w || 20)); mxy = Math.max(mxy, el.y + (el.h || 20))
  })
  if (!isFinite(mnx)) return null
  const pad = 80; mnx -= pad; mny -= pad; mxx += pad; mxy += pad
  const ww = mxx - mnx, wh = mxy - mny
  const ms = Math.min(MW / ww, MH / wh)
  const tm = (wx: number, wy: number) => ({ x: (wx - mnx) * ms, y: (wy - mny) * ms })
  const vpX1 = -transform.x / transform.scale, vpY1 = -transform.y / transform.scale
  const vpX2 = vpX1 + window.innerWidth / transform.scale
  const vpY2 = vpY1 + window.innerHeight / transform.scale
  const vs = tm(vpX1, vpY1), ve = tm(vpX2, vpY2)

  const handleNav = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const wx = (e.clientX - r.left) / ms + mnx
    const wy = (e.clientY - r.top) / ms + mny
    setTransform(t => ({ ...t, x: -wx * t.scale + window.innerWidth / 2, y: -wy * t.scale + window.innerHeight / 2 }))
  }

  return (
    <div className={`absolute bottom-[100px] left-3 z-20 rounded-2xl overflow-hidden shadow-xl border ${darkMode ? 'bg-[#1e293b] border-slate-600' : 'bg-white border-black/10'}`} data-ui>
      <svg width={MW} height={MH} onClick={handleNav} className="cursor-pointer">
        <rect width={MW} height={MH} fill={darkMode ? '#1e293b' : '#f8f8f6'} />
        {elements.map(el => {
          const p = tm(el.x, el.y)
          const w = Math.max((el.w || 6) * ms, 2), h = Math.max((el.h || 6) * ms, 2)
          return <rect key={el.id} x={p.x} y={p.y} width={w} height={h} fill={el.fill || el.color || '#888'} rx={1} opacity={0.7} />
        })}
        <rect x={vs.x} y={vs.y} width={Math.max(ve.x - vs.x, 4)} height={Math.max(ve.y - vs.y, 4)}
          fill="rgba(77,150,255,0.15)" stroke="#4D96FF" strokeWidth={1.5} rx={2} />
      </svg>
    </div>
  )
}
