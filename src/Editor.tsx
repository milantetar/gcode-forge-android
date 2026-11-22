import { SafeAreaView } from 'react-native-safe-area-context'
import { ActionButton as Action, Icon, useUi } from './ui'
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { Keyboard, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native'

const pageSize = 100
const mono = { fontFamily: 'monospace', fontSize: 13, lineHeight: 21, includeFontPadding: false } as const


export function CodeLine({ line }: { line: string }) {
  const { colors } = useUi()
  const comment = line.trim().startsWith('%')
  return <Text selectable style={[mono, { color: colors.text }]}>
    {comment ? <Text style={{ color: colors.muted }}>{line}</Text> : line.split(/(;.*|\([^)]*\)|[GM]\d+(?:\.\d+)?|[XYZBIJKR][+-]?[\d.]+|[FS][\d.]+)/gi).map((token, index) =>
      <Text key={index} style={{ color: /^[GM]/i.test(token) ? colors.command : /^[XYZBIJKR]/i.test(token) ? colors.axis : /^[FS]/i.test(token) ? colors.text : /^[;(]/.test(token) ? colors.muted : colors.text }}>{token}</Text>)}
    {!line && ' '}
  </Text>
}

export function Editor({ value, onChange, searchOpen, onCloseSearch, onEditStart }: {
  value: string; onChange: (value: string) => void; searchOpen: boolean; onCloseSearch: () => void; onEditStart?: () => void
}) {
  const { colors } = useUi()
  const { width, fontScale } = useWindowDimensions()
  const [page, setPage] = useState(0)
  const [find, setFind] = useState('')
  const [replacement, setReplacement] = useState('')
  const [jump, setJump] = useState('')
  const [feedback, setFeedback] = useState('')
  const [highlight, setHighlight] = useState(true)
  const [undo, setUndo] = useState<string[]>([])
  const [redo, setRedo] = useState<string[]>([])
  const lastEdit = useRef(0)
  const input = useRef<ComponentRef<typeof TextInput>>(null)
  const vertical = useRef<ComponentRef<typeof ScrollView>>(null)
  const wantsFocus = useRef(false)
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const lines = useMemo(() => value.split('\n'), [value])
  const pages = Math.ceil(lines.length / pageSize)
  const currentPage = Math.min(page, Math.max(0, pages - 1))
  const start = currentPage * pageSize
  const visibleLines = lines.slice(start, start + pageSize)
  const pageText = visibleLines.join('\n')
  const contentWidth = Math.max(width - 64, ...visibleLines.map(line => line.length * 8 * fontScale + 24))
  const lineHeight = mono.lineHeight * fontScale

  useEffect(() => {
    if (highlight || searchOpen || !wantsFocus.current) return
    wantsFocus.current = false
    const frame = requestAnimationFrame(() => {
      input.current?.focus()
      const localLine = pageText.slice(0, selection.start).split('\n').length - 1
      vertical.current?.scrollTo({ y: Math.max(0, localLine * lineHeight - lineHeight * 2), animated: false })
    })
    return () => cancelAnimationFrame(frame)
  }, [highlight, searchOpen, currentPage, selection.start, pageText, lineHeight])

  function limitHistory(items: string[]) {
    let bytes = 0
    return items.slice(-20).reverse().filter(item => { bytes += item.length; return bytes <= 4_000_000 }).reverse()
  }
  function commit(next: string, grouped = false) {
    if (next.length > 1_000_000) { setFeedback('Maximum source size is 1,000,000 characters.'); return }
    const now = Date.now()
    if (!grouped || now - lastEdit.current > 600) setUndo(items => limitHistory([...items, value]))
    lastEdit.current = now
    setRedo([])
    onChange(next)
  }
  function goToLine(line: number) {
    if (!Number.isInteger(line) || line < 1 || line > lines.length) {
      setFeedback('Enter a line from 1 to ' + lines.length)
      return false
    }
    const firstLine = Math.floor((line - 1) / pageSize) * pageSize
    const localStart = lines.slice(firstLine, line - 1).join('\n').length + (line - 1 > firstLine ? 1 : 0)
    setPage(Math.floor((line - 1) / pageSize))
    setSelection({ start: localStart, end: localStart + lines[line - 1].length })
    wantsFocus.current = true
    setHighlight(false)
    return true
  }
  function search() {
    if (!find) return
    const offset = lines.slice(0, start).join('\n').length + (start ? 1 : 0) + selection.end
    let match = value.indexOf(find, offset)
    if (match < 0) match = value.indexOf(find)
    if (match < 0) { setFeedback('No matches.'); return }
    const line = value.slice(0, match).split('\n').length
    goToLine(line)
    const firstLine = Math.floor((line - 1) / pageSize) * pageSize
    const pageOffset = lines.slice(0, firstLine).join('\n').length + (firstLine ? 1 : 0)
    setSelection({ start: match - pageOffset, end: match - pageOffset + find.length })
    onCloseSearch()
  }
  const field = { borderWidth: 1, borderColor: colors.input, borderRadius: 7, color: colors.text, paddingHorizontal: 12, minHeight: 44, flex: 1, minWidth: 0 }
  return <View style={{ flex: 1, minHeight: 0 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 4, gap: 8, minHeight: 52, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Action label="Undo edit" icon="undo" iconOnly disabled={!undo.length} onPress={() => {
          setRedo(items => limitHistory([...items, value])); onChange(undo[undo.length - 1]); setUndo(items => items.slice(0, -1)); lastEdit.current = 0
        }} />
        <Action label="Redo edit" icon="redo" iconOnly disabled={!redo.length} onPress={() => {
          setUndo(items => limitHistory([...items, value])); onChange(redo[redo.length - 1]); setRedo(items => items.slice(0, -1)); lastEdit.current = 0
        }} />
      </View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4 }}>
        {([false, true] as const).map(colorView => <Pressable key={String(colorView)} accessibilityRole="tab" accessibilityState={{ selected: highlight === colorView }}
          accessibilityLabel={colorView ? 'Syntax color view, read only' : 'Edit source code'}
          onPress={() => {
            if (colorView) { Keyboard.dismiss(); setHighlight(true) }
            else { wantsFocus.current = true; setHighlight(false) }
          }}
          style={{ minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 2, borderBottomColor: highlight === colorView ? colors.accent : 'transparent' }}>
          <Icon name={colorView ? 'code' : 'file'} size={15} color={highlight === colorView ? colors.accent : colors.muted} />
          <Text style={{ fontSize: 12, color: highlight === colorView ? colors.accent : colors.muted }}>{colorView ? 'Color' : 'Edit'}</Text>
        </Pressable>)}
      </View>
    </View>
    <ScrollView ref={vertical} style={{ flex: 1, backgroundColor: colors.editor }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={{ minWidth: '100%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ display: value ? 'flex' : 'none', paddingVertical: 8, paddingHorizontal: 8, backgroundColor: colors.surface, minWidth: 40 }}>
            {visibleLines.map((_, index) => <Text key={index} style={[mono, { color: colors.faint, textAlign: 'right' }]}>{start + index + 1}</Text>)}
          </View>
          {highlight ? <View style={{ paddingVertical: 8, paddingHorizontal: 8, width: contentWidth }}>
            {visibleLines.map((line, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={'Edit line ' + (start + index + 1)} onPress={() => goToLine(start + index + 1)}><CodeLine line={line} /></Pressable>)}
          </View> : <TextInput ref={input} accessibilityLabel="Source G-code page" multiline scrollEnabled={false} onFocus={onEditStart}
            autoCapitalize="none" autoCorrect={false} textAlignVertical="top" underlineColorAndroid="transparent"
            style={[mono, { color: colors.text, width: contentWidth, minHeight: lineHeight * visibleLines.length + 16, paddingVertical: 8, paddingHorizontal: 8 }]}
            value={pageText} selection={selection} onSelectionChange={event => setSelection(event.nativeEvent.selection)}
            onChangeText={text => commit([...lines.slice(0, start), text, ...lines.slice(start + pageSize)].join('\n'), true)} />}
        </View>
      </ScrollView>
    </ScrollView>
    {!value && highlight && <Pressable accessibilityRole="button" accessibilityLabel="Paste or enter G-code" onPress={() => { wantsFocus.current = true; setHighlight(false) }} style={{ position: 'absolute', top: 52, bottom: 0, left: 0, right: 0, backgroundColor: colors.editor, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 }}>
      <Icon name="code" size={24} />
      <Text style={{ color: colors.text, fontSize: 13, textAlign: 'center' }}>Paste G-code or open a local file</Text>
      <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>Tap to edit. An empty source runs the default sample.</Text>
    </Pressable>}
    {pages > 1 && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 4, gap: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Action label="Previous 100 source lines" icon="previous" iconOnly disabled={currentPage === 0} onPress={() => { setPage(currentPage - 1); setSelection({ start: 0, end: 0 }); vertical.current?.scrollTo({ y: 0 }) }} />
      <Text style={{ color: colors.muted, fontSize: 11 }}>Page {currentPage + 1} of {pages}</Text>
      <Action label="Next 100 source lines" icon="next" iconOnly disabled={currentPage === pages - 1} onPress={() => { setPage(currentPage + 1); setSelection({ start: 0, end: 0 }); vertical.current?.scrollTo({ y: 0 }) }} />
    </View>}
    <Modal visible={searchOpen} animationType="none" onRequestClose={onCloseSearch}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Search source</Text>
          <Action label="Close search" icon="close" iconOnly onPress={onCloseSearch} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Find and replace are case sensitive.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput accessibilityLabel="Find text" placeholder="Find text" placeholderTextColor={colors.muted} style={field} value={find} onChangeText={setFind} autoCapitalize="none" autoCorrect={false} onSubmitEditing={search} />
            <Action label="Find next" icon="search" onPress={search} disabled={!find} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput accessibilityLabel="Replacement text" placeholder="Replace with" placeholderTextColor={colors.muted} style={field} value={replacement} onChangeText={setReplacement} autoCapitalize="none" autoCorrect={false} />
            <Action label="Replace all" icon="replace" disabled={!find} onPress={() => {
              const count = value.split(find).length - 1
              if (value.length + count * (replacement.length - find.length) > 1_000_000) { setFeedback('Replacement would exceed the source limit.'); return }
              if (count) commit(value.split(find).join(replacement))
              setFeedback(count + ' replacements.')
            }} />
          </View>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Jump to line</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput accessibilityLabel="Jump to line" placeholder={'1 to ' + lines.length} placeholderTextColor={colors.muted} keyboardType="number-pad" style={field} value={jump} onChangeText={setJump} onSubmitEditing={() => { if (goToLine(Number(jump))) onCloseSearch() }} />
            <Action label="Go to line" icon="next" onPress={() => { if (goToLine(Number(jump))) onCloseSearch() }} />
          </View>
          {!!feedback && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12 }}>{feedback}</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </View>
}

export function Comparison({ source, output }: { source: string; output: string }) {
  const { colors } = useUi()
  const [page, setPage] = useState(0)
  const before = useMemo(() => source.split('\n'), [source])
  const after = useMemo(() => output.split('\n'), [output])
  const count = Math.max(before.length, after.length)
  return <View style={{ padding: 10, gap: 8 }}>
    <Text style={{ color: colors.muted, fontSize: 11 }}>Line-by-line comparison · source above, output below</Text>
    {Array.from({ length: Math.min(50, Math.max(0, count - page * 50)) }, (_, offset) => {
      const index = page * 50 + offset
      const changed = before[index] !== after[index]
      return <View key={index} style={{ padding: 8, gap: 4, borderLeftWidth: 2, borderLeftColor: changed ? colors.accent : colors.border, backgroundColor: colors.editor }}>
        <Text style={{ color: colors.faint, fontSize: 10 }}>Line {index + 1}{changed ? ' · changed' : ''}</Text>
        <CodeLine line={before[index] ?? '(no source line)'} /><CodeLine line={after[index] ?? '(no output line)'} />
      </View>
    })}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Action label="Previous" disabled={page === 0} onPress={() => setPage(value => value - 1)} />
      <Action label="Next" disabled={(page + 1) * 50 >= count} onPress={() => setPage(value => value + 1)} />
    </View>
  </View>
}
