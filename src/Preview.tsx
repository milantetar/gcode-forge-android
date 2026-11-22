import { ActionButton as Action, useUi } from './ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, Pressable, Text, View } from 'react-native'
import Svg, { Circle, G, Path } from 'react-native-svg'

import { parseToolpath, type Point } from './toolpath'

const isoCamera = { yaw: Math.PI / 4, pitch: Math.PI / 6, zoom: 1, x: 0, y: 0 }


export function Preview({ code, onInteracting, onLine, selectedLine = 1, units = 'mm', height = 320 }: { code: string; onInteracting?: (active: boolean) => void; onLine?: (line: number) => void; selectedLine?: number; units?: 'mm' | 'in'; height?: number }) {
  const { colors } = useUi()
  const analysis = useMemo(() => parseToolpath(code), [code])
  const moves = analysis.moves
  const [position, setPosition] = useState(() => {
    const index = moves.findIndex(move => move.line >= selectedLine)
    return index < 0 ? Math.max(0, moves.length - 1) : index
  })
  const [showRapids, setShowRapids] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [camera, setCamera] = useState(isoCamera)
  const cameraRef = useRef(isoCamera)
  const widthRef = useRef(320)
  const gestureRef = useRef({ count: 0, x: 0, y: 0, distance: 1, camera: isoCamera })
  const [trackWidth, setTrackWidth] = useState(1)
  const gestures = useMemo(() => {
    const finish = () => { gestureRef.current.count = 0; onInteracting?.(false) }
    // PanResponder stores these callbacks. Ref access happens only during touch events.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { gestureRef.current.count = 0; onInteracting?.(true) },
      onPanResponderMove: event => {
        const touches = event.nativeEvent.touches
        if (!touches.length) return
        const first = touches[0], second = touches[1] ?? first
        const x = (first.pageX + second.pageX) / 2
        const y = (first.pageY + second.pageY) / 2
        const distance = Math.max(1, Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY))
        if (gestureRef.current.count !== touches.length) {
          gestureRef.current = { count: touches.length, x, y, distance, camera: cameraRef.current }
          return
        }
        const start = gestureRef.current
        const next = touches.length === 1
          ? { ...start.camera, yaw: start.camera.yaw + (x - start.x) * .01, pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, start.camera.pitch + (y - start.y) * .01)) }
          : { ...start.camera, zoom: Math.max(.25, Math.min(8, start.camera.zoom * distance / start.distance)), x: start.camera.x + (x - start.x) * 320 / Math.min(widthRef.current, 320), y: start.camera.y + (y - start.y) * 320 / Math.min(widthRef.current, 320) }
        cameraRef.current = next
        setCamera(next)
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => false,
    })
  }, [onInteracting])
  useEffect(() => () => onInteracting?.(false), [onInteracting])
  function resetCamera(top = false) {
    const next = { ...isoCamera, ...(top ? { yaw: 0, pitch: Math.PI / 2 } : {}) }
    cameraRef.current = next
    setCamera(next)
  }
  useEffect(() => {
    if (!playing || position >= moves.length) return
    const timer = setInterval(() => {
      setPosition(value => Math.min(moves.length, value + speed))
    }, 50)
    return () => clearInterval(timer)
  }, [playing, moves.length, speed, position])
  const drawing = useMemo(() => {
    const project = ([x, y, z]: Point) => {
      const horizontal = x * Math.cos(camera.yaw) - y * Math.sin(camera.yaw)
      const depth = x * Math.sin(camera.yaw) + y * Math.cos(camera.yaw)
      return [horizontal, depth * Math.sin(camera.pitch) - z * Math.cos(camera.pitch)]
    }
    const segments = moves.map(move => ({ ...move, a: project(move.from), b: project(move.to) }))
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const { a, b } of segments) for (const p of [a, b]) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0])
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1])
    }
    const scale = (segments.length ? 270 / Math.max(maxX - minX, maxY - minY, 1) : 1)
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2
    const fit = (p: number[]) => [160 + (p[0] - centerX) * scale, 160 + (p[1] - centerY) * scale]
    return segments.map(segment => ({ a: fit(segment.a), b: fit(segment.b), rapid: segment.rapid }))
  }, [moves, camera.yaw, camera.pitch])
  const cut = useMemo(() => drawing.filter(segment => !segment.rapid).map(({ a, b }) => `M${a[0]},${a[1]}L${b[0]},${b[1]}`).join(''), [drawing])
  const rapid = useMemo(() => drawing.filter(segment => segment.rapid).map(({ a, b }) => `M${a[0]},${a[1]}L${b[0]},${b[1]}`).join(''), [drawing])
  const current = drawing[Math.min(Math.floor(position), drawing.length - 1)]
  const fraction = position >= drawing.length ? 1 : position % 1
  if (!moves.length) return <View style={{ gap: 8, padding: 16 }}><Text style={{ color: colors.muted }}>No supported moves to display.</Text>{analysis.warnings.map(warning => <Text key={warning} style={{ color: colors.muted }}>{warning}</Text>)}</View>
  const currentMove = moves[Math.min(Math.floor(position), moves.length - 1)]
  const coordinates = currentMove.from.map((value, axis) => value + (currentMove.to[axis] - value) * fraction)
  const format = (value: number) => (value / (units === 'in' ? 25.4 : 1)).toFixed(units === 'in' ? 4 : 2)
  return <View style={{ gap: 12 }}>
    {selectedLine > 1 && !moves.some(move => move.line === selectedLine) && <Text style={{ color: colors.muted, fontSize: 11 }}>Selected line has no preview motion. Showing the nearest supported move.</Text>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>3D toolpath</Text>
      <Text style={{ color: colors.success, fontSize: 10 }}>Cut <Text style={{ color: colors.muted }}> · Rapid</Text></Text>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      <Action label="Iso" onPress={() => resetCamera()} /><Action label="Top" onPress={() => resetCamera(true)} />
      <Action label={showRapids ? 'Hide rapids' : 'Show rapids'} onPress={() => setShowRapids(value => !value)} />
      <Action label="Reset view" onPress={() => resetCamera()} />
      <Action label={speed + '×'} onPress={() => setSpeed(speed === 4 ? 1 : speed * 2)} />
    </View>
    <View {...gestures.panHandlers} onLayout={event => { widthRef.current = event.nativeEvent.layout.width }} style={{ height, backgroundColor: colors.background }} accessible accessibilityLabel="Toolpath viewport. Drag to rotate. Pinch to zoom. Two fingers to pan."><Svg viewBox="0 0 320 320" width="100%" height={height}>
      <G transform={`translate(${160 + camera.x} ${160 + camera.y}) scale(${camera.zoom}) translate(-160 -160)`}>
      <Path d={cut} stroke={colors.success} strokeWidth={1 / camera.zoom} fill="none" />
      {showRapids && <Path d={rapid} stroke={colors.muted} strokeWidth={.7 / camera.zoom} strokeDasharray="3 3" fill="none" />}
      {current && <Circle cx={current.a[0] + (current.b[0] - current.a[0]) * fraction} cy={current.a[1] + (current.b[1] - current.a[1]) * fraction} r={4 / camera.zoom} fill={colors.accent} />}
    </G></Svg></View><Text style={{ color: colors.muted, fontSize: 11 }}>Drag to rotate · pinch to zoom · two fingers to pan</Text>
    <Pressable accessibilityRole="adjustable" accessibilityLabel="Playback position"
      accessibilityValue={{ min: 0, max: moves.length, now: Math.floor(position) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => { setPlaying(false); setPosition(value => Math.max(0, Math.min(moves.length, value + (event.nativeEvent.actionName === 'increment' ? 1 : -1)))) }}
      onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
      onPress={event => { setPlaying(false); setPosition(Math.max(0, Math.min(moves.length, event.nativeEvent.locationX / trackWidth * moves.length))) }}
      style={{ height: 32, justifyContent: 'center' }}>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.border }}>
        <View style={{ height: 5, borderRadius: 3, width: (position / moves.length * 100) + '%' as `${number}%`, backgroundColor: colors.accent }} />
      </View>
    </Pressable>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Action label={playing && position < moves.length ? 'Pause' : 'Play'} onPress={() => { if (position >= moves.length) setPosition(0); setPlaying(!playing || position >= moves.length) }} />
      <Action label="Restart" onPress={() => { setPlaying(false); setPosition(0) }} />
      <Action label="Step" onPress={() => { setPlaying(false); setPosition(value => Math.min(moves.length, Math.floor(value) + 1)) }} />
    </View>
    <Action label={'Line ' + currentMove.line + ' - view code'} onPress={() => onLine?.(currentMove.line)} />
    <Text style={{ color: colors.muted, fontSize: 11 }}>X {format(coordinates[0])}  Y {format(coordinates[1])}  Z {format(coordinates[2])} {units}</Text>
    <Text style={{ color: colors.muted, fontSize: 11 }}>Bounds X {format(analysis.max[0] - analysis.min[0])} / Y {format(analysis.max[1] - analysis.min[1])} / Z {format(analysis.max[2] - analysis.min[2])} {units}</Text>
    <Text style={{ color: colors.muted, fontSize: 11 }}>Cut {format(analysis.cutDistance)} / Rapid {format(analysis.rapidDistance)} {units}</Text>
    <Text style={{ color: colors.muted, fontSize: 11 }}>{analysis.feedSeconds === null ? 'Feed time unavailable' : 'Programmed feed time ' + Math.round(analysis.feedSeconds) + ' s (excludes rapids and acceleration)'}</Text>
    {analysis.warnings.map(warning => <Text key={warning} style={{ color: colors.text, fontSize: 11 }}>{warning}</Text>)}
    <Text style={{ color: colors.muted, fontSize: 12 }}>{Math.floor(position)} / {moves.length} segments · visual playback</Text>
  </View>
}
