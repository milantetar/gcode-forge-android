export type Point = [number, number, number]
export type Move = { from: Point; to: Point; rapid: boolean; line: number }
export type Toolpath = {
  moves: Move[]
  warnings: string[]
  min: Point
  max: Point
  cutDistance: number
  rapidDistance: number
  feedSeconds: number | null
}

const distance = (a: Point, b: Point) => Math.hypot(...a.map((value, index) => value - b[index]))
const rotate = ([x, y, z]: Point, angle: number): Point => {
  const radians = angle * Math.PI / 180
  return [x * Math.cos(radians) - z * Math.sin(radians), y, x * Math.sin(radians) + z * Math.cos(radians)]
}

function sweep(start: number, end: number, clockwise: boolean) {
  let value = end - start
  if (clockwise) { while (value >= -1e-10) value -= Math.PI * 2 }
  else { while (value <= 1e-10) value += Math.PI * 2 }
  return value
}

/** Coordinates are normalized to mm. Unknown motion modes stop the preview. */
export function parseToolpath(source: string): Toolpath {
  const result: Toolpath = { moves: [], warnings: [], min: [0, 0, 0], max: [0, 0, 0], cutDistance: 0, rapidDistance: 0, feedSeconds: 0 }
  let position: Point = [0, 0, 0]
  let absolute = true, absoluteCenter = false, units = 1, motion = 1, b = 0, feed = 0
  let plane: [number, number, number] = [0, 1, 2]
  let timeKnown = true
  const lines = source.split(/\r?\n/)
  function append(from: Point, to: Point, line: number, rapid: boolean) {
    if (result.moves.length >= 100_000) throw new Error('Preview exceeds 100,000 segments. Use a smaller program.')
    const length = distance(from, to)
    if (length < 1e-9) return
    result.moves.push({ from, to, line, rapid })
    for (const point of [from, to]) for (let axis = 0; axis < 3; axis++) {
      result.min[axis] = Math.min(result.min[axis], point[axis])
      result.max[axis] = Math.max(result.max[axis], point[axis])
    }
    if (rapid) result.rapidDistance += length
    else {
      result.cutDistance += length
      if (feed > 0) result.feedSeconds! += length / feed * 60
      else timeKnown = false
    }
  }
  try {
    for (let index = 0; index < lines.length; index++) {
      const lineNumber = index + 1
      const text = lines[index].replace(/\([^)]*\)/g, '').split(';')[0].trim().toUpperCase()
      if (!text || text.startsWith('%')) continue
      const words = [...text.matchAll(/([A-Z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g)]
      const endsProgram = words.some(([, letter, raw]) => letter === 'M' && [2, 30].includes(Number(raw)))
      const values: Record<string, number> = {}
      let unsupported = ''
      for (const [, letter, raw] of words) {
        const value = Number(raw)
        values[letter] = value
        if (letter === 'G') {
          if ([0, 1, 2, 3].includes(value)) motion = value
          else if (value === 20) units = 25.4
          else if (value === 21) units = 1
          else if (value === 90) absolute = true
          else if (value === 91) absolute = false
          else if (value === 90.1) absoluteCenter = true
          else if (value === 91.1) absoluteCenter = false
          else if (value === 17) plane = [0, 1, 2]
          else if (value === 18) plane = [2, 0, 1]
          else if (value === 19) plane = [1, 2, 0]
          else if (![40, 49, 80, 94].includes(value)) unsupported = 'G' + raw
          if (value === 80) motion = -1
        }
        if (['A', 'C'].includes(letter)) unsupported = letter + raw
        if (letter === 'M' && [98, 99].includes(value)) unsupported = 'M' + raw
      }
      if (unsupported || /[#[\]]/.test(text)) {
        result.warnings.push('Line ' + lineNumber + ': unsupported ' + (unsupported || 'macro expression') + '. Preview stops here.')
        timeKnown = false
        break
      }
      if (values.F !== undefined) feed = values.F * units
      const next: Point = [...position]
      const nextB = values.B === undefined ? b : (absolute ? 0 : b) + values.B
      let hasAxis = values.B !== undefined
      for (const [axis, name] of ['X', 'Y', 'Z'].entries()) if (values[name] !== undefined) {
        next[axis] = (absolute ? 0 : position[axis]) + values[name] * units
        hasAxis = true
      }
      const [u, v, w] = plane
      const centers = ['I', 'J', 'K']
      const isArc = motion === 2 || motion === 3
      const arcWords = values.R !== undefined || values[centers[u]] !== undefined || values[centers[v]] !== undefined
      if (!hasAxis && !(isArc && arcWords)) {
        if (endsProgram) break
        continue
      }
      if (motion < 0) throw new Error('Line ' + lineNumber + ': axis move without an active motion mode.')
      if (nextB !== b) timeKnown = false
      if (!isArc) append(rotate(position, b), rotate(next, nextB), lineNumber, motion === 0)
      else {
        let cu: number, cv: number
        const clockwise = motion === 2
        if (values.R !== undefined) {
          const radius = Math.abs(values.R * units)
          const dx = next[u] - position[u], dy = next[v] - position[v]
          const chord = Math.hypot(dx, dy)
          if (chord < 1e-9 || chord > radius * 2 + 1e-6) throw new Error('Line ' + lineNumber + ': invalid R arc.')
          const h = Math.sqrt(Math.max(0, radius * radius - chord * chord / 4))
          cu = (position[u] + next[u]) / 2 - dy / chord * h
          cv = (position[v] + next[v]) / 2 + dx / chord * h
          const arcSweep = Math.abs(sweep(Math.atan2(position[v] - cv, position[u] - cu), Math.atan2(next[v] - cv, next[u] - cu), clockwise))
          if ((arcSweep > Math.PI + 1e-8) !== (values.R < 0)) {
            cu = (position[u] + next[u]) / 2 + dy / chord * h
            cv = (position[v] + next[v]) / 2 - dx / chord * h
          }
        } else {
          if (!arcWords) throw new Error('Line ' + lineNumber + ': arc center is missing.')
          cu = absoluteCenter ? (values[centers[u]] === undefined ? position[u] : values[centers[u]] * units) : position[u] + (values[centers[u]] ?? 0) * units
          cv = absoluteCenter ? (values[centers[v]] === undefined ? position[v] : values[centers[v]] * units) : position[v] + (values[centers[v]] ?? 0) * units
        }
        const radius = Math.hypot(position[u] - cu, position[v] - cv)
        if (radius < 1e-9 || Math.abs(radius - Math.hypot(next[u] - cu, next[v] - cv)) > Math.max(.01, radius * .001)) {
          throw new Error('Line ' + lineNumber + ': arc endpoints do not match its radius.')
        }
        const start = Math.atan2(position[v] - cv, position[u] - cu)
        const angle = sweep(start, Math.atan2(next[v] - cv, next[u] - cu), clockwise)
        const steps = Math.min(4096, Math.max(4, Math.ceil(Math.abs(angle) / Math.min(.05, Math.sqrt(.4 / radius)))))
        let last = rotate(position, b)
        for (let step = 1; step <= steps; step++) {
          const t = step / steps
          const point: Point = [...position]
          point[u] = cu + Math.cos(start + angle * t) * radius
          point[v] = cv + Math.sin(start + angle * t) * radius
          point[w] = position[w] + (next[w] - position[w]) * t
          const end = rotate(step === steps ? next : point, b + (nextB - b) * t)
          append(last, end, lineNumber, false)
          last = end
        }
      }
      position = next
      b = nextB
      if (endsProgram) break
    }
  } catch (error) {
    result.warnings.push(error instanceof Error ? error.message : 'Cannot preview this program.')
    timeKnown = false
  }
  if (!timeKnown) result.feedSeconds = null
  return result
}
