import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, Text } from 'react-native'
import { useSQLiteContext } from 'expo-sqlite'
import Svg, { Path } from 'react-native-svg'

export const darkColors = {
  background: '#1e1f22', editor: '#232428', surface: '#2b2d31', raised: '#35373c',
  selected: '#353962', border: '#41434a', input: '#626570',
  text: '#f2f3f5', muted: '#b5bac1', faint: '#a0a5af',
  accent: '#a5adff', primary: '#4752c4', primaryText: '#ffffff', success: '#83ddb2',
  command: '#aeb8ff', axis: '#8cd6b0',
}
export type Colors = typeof darkColors
const lightColors: Colors = {
  background: '#e3e5e8', editor: '#ffffff', surface: '#f2f3f5', raised: '#e3e5e8',
  selected: '#e1e3fa', border: '#c4c7ce', input: '#828792',
  text: '#232428', muted: '#4e5058', faint: '#626570',
  accent: '#4752c4', primary: '#4752c4', primaryText: '#ffffff', success: '#176b47',
  command: '#4752c4', axis: '#176b47',
}
const UiContext = createContext({ colors: darkColors, mode: 'dark' as 'dark' | 'light', reducedMotion: true, toggleTheme: () => {} })
export const useUi = () => useContext(UiContext)

export function UiProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext()
  const [mode, setMode] = useState<'dark' | 'light'>('dark')
  const [reducedMotion, setReducedMotion] = useState(true)
  const themeChanged = useRef(false)
  const writes = useRef(Promise.resolve())
  useEffect(() => {
    let active = true
    void db.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'theme'").then(row => {
      if (active && !themeChanged.current && (row?.value === 'light' || row?.value === 'dark')) setMode(row.value)
    }).catch(() => {})
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value) }).catch(() => {})
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion)
    return () => { active = false; subscription.remove() }
  }, [db])
  const value = useMemo(() => ({
    colors: mode === 'dark' ? darkColors : lightColors, mode, reducedMotion,
    toggleTheme: () => {
      const next = mode === 'dark' ? 'light' : 'dark'
      themeChanged.current = true
      setMode(next)
      writes.current = writes.current.then(() => db.runAsync("INSERT OR REPLACE INTO preferences (key, value) VALUES ('theme', ?)", next)).then(() => {}).catch(() => {})
    },
  }), [mode, reducedMotion, db])
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

const paths = {
  play: 'm8 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  folder: 'M3 7V5h6l2 2h10v13H3Z',
  file: 'M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h6',
  copy: 'M9 8h11v13H9ZM15 8V3H4v13h5',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  save: 'M4 3h14l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 6 6',
  plus: 'M12 4v16M4 12h16',
  close: 'm5 5 14 14M19 5 5 19',
  chevronDown: 'm6 9 6 6 6-6',
  chevronUp: 'm6 15 6-6 6 6',
  previous: 'm15 5-7 7 7 7',
  next: 'm9 5 7 7-7 7',
  undo: 'm8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7',
  redo: 'm16 4 5 5-5 5M21 9H11a7 7 0 0 0-7 7',
  reset: 'M4 10a8 8 0 1 1 1 8M4 3v7h7',
  export: 'M12 15V3m-5 5 5-5 5 5M4 14v7h16v-7',
  import: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  sun: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2',
  moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z',
  code: 'm8 5-6 7 6 7M16 5l6 7-6 7M14 2l-4 20',
  expand: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
  target: 'M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14ZM12 1v7M12 16v7M1 12h7M16 12h7',
  check: 'm4 12 5 5L20 6',
  compare: 'M8 3v18M16 3v18M3 7h10M11 17h10',
  replace: 'M3 6h15m-4-4 4 4-4 4M21 18H6m4-4-4 4 4 4',
  repeat: 'm17 2 4 4-4 4M3 11V6h18M7 22l-4-4 4-4M21 13v5H3',
  box: 'm12 2 10 5v10l-10 5-10-5V7ZM2 7l10 5 10-5M12 12v10',
} as const
export type IconName = keyof typeof paths

export function Icon({ name, size = 17, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useUi()
  return <Svg width={size} height={size} style={{ flexShrink: 0 }} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d={paths[name]} stroke={color ?? colors.accent} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
}

function iconFor(label: string): IconName {
  const rules: [RegExp, IconName][] = [
    [/undo/i, 'undo'], [/redo/i, 'redo'], [/pause/i, 'pause'], [/play|generate|run/i, 'play'],
    [/previous/i, 'previous'], [/next|step|go$/i, 'next'], [/delete|clear/i, 'trash'],
    [/copy|duplicate/i, 'copy'], [/replace/i, 'replace'], [/export/i, 'export'], [/import|restore/i, 'import'],
    [/save/i, 'save'], [/find|search/i, 'search'], [/close|dismiss|cancel/i, 'close'],
    [/fullscreen/i, 'expand'], [/reset|restart/i, 'reset'], [/code|syntax/i, 'code'],
    [/preset|parameter|recovery/i, 'settings'], [/open/i, 'folder'],
  ]
  return rules.find(([pattern]) => pattern.test(label))?.[1] ?? 'target'
}

export function ActionButton({ label, onPress, disabled = false, primary = false, icon, iconOnly = false }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean; icon?: IconName; iconOnly?: boolean
}) {
  const { colors, reducedMotion } = useUi()
  const [scale] = useState(() => new Animated.Value(1))
  const animate = (toValue: number) => {
    if (reducedMotion) return
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 35, bounciness: 3 }).start()
  }
  return <Animated.View style={{ transform: [{ scale }], opacity: disabled ? .4 : 1, flexShrink: 1, maxWidth: '100%' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      onPressIn={() => animate(.96)} onPressOut={() => animate(1)} onPress={onPress}
      style={({ pressed }) => ({ minHeight: primary ? 48 : 44, minWidth: 44, paddingHorizontal: iconOnly ? 8 : 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderRadius: 8, borderColor: primary ? colors.primary : colors.border,
        backgroundColor: primary ? colors.primary : pressed ? colors.selected : colors.raised })}>
      {/^Generating/.test(label) ? <ActivityIndicator size="small" color={primary ? colors.primaryText : colors.accent} /> : <Icon name={icon ?? iconFor(label)} color={primary ? colors.primaryText : colors.accent} />}
      {!iconOnly && <Text style={{ flexShrink: 1, textAlign: 'center', fontSize: primary ? 14 : 11, fontWeight: primary ? '700' : '500', color: primary ? colors.primaryText : colors.text }}>{label}</Text>}
    </Pressable>
  </Animated.View>
}

export function Transition({ children, trigger, fill = true }: { children: ReactNode; trigger: string; fill?: boolean }) {
  const { reducedMotion } = useUi()
  const [opacity] = useState(() => new Animated.Value(1))
  useEffect(() => {
    if (reducedMotion) { opacity.setValue(1); return }
    opacity.setValue(.25)
    const animation = Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [trigger, reducedMotion, opacity])
  return <Animated.View style={{ flex: fill ? 1 : undefined, opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }] }}>{children}</Animated.View>
}
