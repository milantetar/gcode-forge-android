import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { ActivityIndicator, Alert, AppState, BackHandler, FlatList, Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite'
import * as DocumentPicker from 'expo-document-picker'
import * as Clipboard from 'expo-clipboard'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { generate, samples, tools, type Settings, type Tool } from './src/gcode'
import { createProject, deleteProject, duplicateProject, listProjects, migrate, openWorkspace, saveProject, type Project } from './src/storage'
import { Preview } from './src/Preview'
import { CodeLine, Comparison, Editor } from './src/Editor'
import { WorkspaceTools } from './src/WorkspaceTools'
import { ActionButton as Button, Icon, UiProvider, useUi, type Colors } from './src/ui'
import Svg, { Circle, Path } from 'react-native-svg'

function report(error: unknown) {
  Alert.alert('G-Code Forge', error instanceof Error ? error.message : 'Operation failed. Please try again.')
}
function NumericField({ label, value, units, linear, rate, suffix, onChange }: {
  label: string; value: string; units: 'mm' | 'in'; linear: boolean; rate: boolean; suffix?: string; onChange: (value: string) => void
}) {
  const { colors } = useUi()
  const s = useMemo(() => makeStyles(colors), [colors])
  const [draft, setDraft] = useState<string | null>(null)
  const factor = linear && units === 'in' ? 25.4 : 1
  const display = factor !== 1 && value.trim() && Number.isFinite(Number(value)) ? String(Number((Number(value) / factor).toPrecision(12))) : value
  return <View style={s.field}>
    <Text style={s.caption}>{label}</Text>
    <View style={[s.unitInput, draft !== null && { borderColor: colors.accent }]}>
      <TextInput accessibilityLabel={label} style={s.numberInput} keyboardType="numbers-and-punctuation" value={draft ?? display}
        onFocus={() => setDraft(display)} onBlur={() => setDraft(null)}
        onChangeText={text => {
          setDraft(text)
          onChange(factor !== 1 && text.trim() && Number.isFinite(Number(text)) ? String(Number(text) * factor) : text)
        }} />
      {(linear || suffix) && <Text style={s.suffix}>{suffix ?? (units + (rate ? '/min' : ''))}</Text>}
    </View>
  </View>
}
function Workspace() {
  const { colors, mode, toggleTheme } = useUi()
  const s = useMemo(() => makeStyles(colors), [colors])
  const db = useSQLiteContext()
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [tool, setTool] = useState<Tool>('repeater')
  const [tab, setTab] = useState<'Source' | 'Output' | 'Preview' | 'Compare'>('Source')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [outputPage, setOutputPage] = useState(0)
  const [opening, setOpening] = useState(true)
  const [previewInteracting, setPreviewInteracting] = useState(false)
  const [parametersOpen, setParametersOpen] = useState(false)
  const [configExpanded, setConfigExpanded] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [search, setSearch] = useState('')
  const [editorEpoch, setEditorEpoch] = useState(0)
  const [selectedLine, setSelectedLine] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [received, setReceived] = useState(() => Sharing.getSharedPayloads().filter(item => item.shareType === 'file'))
  const { width, height } = useWindowDimensions()
  const split = width >= 720 && width > height
  const expoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  const pending = useRef<Project | null>(null)
  const outputScroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const saveQueue = useRef(Promise.resolve())
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))
    return () => { show.remove(); hide.remove() }
  }, [])
  useEffect(() => {
    if (tab !== 'Output') return
    const frame = requestAnimationFrame(() => outputScroll.current?.scrollTo({
      y: Math.floor((selectedLine - 1) / 200) === outputPage ? ((selectedLine - 1) % 200) * 21 : 0,
      animated: false,
    }))
    return () => cancelAnimationFrame(frame)
  }, [tab, selectedLine, outputPage])
  const persist = useCallback((value: Project) => {
    const save = saveQueue.current.then(() => saveProject(db, value))
    saveQueue.current = save.catch(report)
    return save
  }, [db])
  const load = useCallback(async () => {
    try { setProjects(await listProjects(db)) } catch (error) { report(error) }
  }, [db])
  useEffect(() => {
    let mounted = true
    void migrate(db).then(() => openWorkspace(db)).then(async workspace => {
      const values = await listProjects(db)
      if (mounted) {
        setProjects(values.length ? values : [workspace])
        setProject(workspace)
        setTool(workspace.tool)
      }
    }).catch(report).finally(() => { if (mounted) setOpening(false) })
    return () => { mounted = false }
  }, [db])
  useEffect(() => {
    if (!project) return
    pending.current = project
    const timer = setTimeout(() => { void persist(project).catch(report) }, 400)
    autosaveTimer.current = timer
    return () => clearTimeout(timer)
  }, [project, persist])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && pending.current) void persist(pending.current).catch(report)
      if (state === 'active') setReceived(Sharing.getSharedPayloads().filter(item => item.shareType === 'file'))
    })
    return () => subscription.remove()
  }, [persist])
  async function importReceived() {
    if (!received[0] || !project) return
    setBusy(true)
    try {
      const uri = received[0].value
      if (!uri.startsWith('file://') && !uri.startsWith('content://')) throw new Error('Only local files can be imported.')
      const file = new File(uri)
      if (file.size > 1_000_000) throw new Error('Choose a file smaller than 1 MB.')
      const source = await file.text()
      if (source.length > 1_000_000) throw new Error('Choose a smaller program.')
      await flush()
      update({ source, output: '' })
      setTab('Source')
      Sharing.clearSharedPayloads()
      setReceived([])
      setMessage('Imported shared file. The previous source is in recovery history.')
    } catch (error) { report(error) }
    finally { setBusy(false) }
  }
  function update(patch: Partial<Project>, resetEditor = true) {
    setProject(value => value ? {
      ...value, ...patch,
      output: patch.output ?? (patch.source !== undefined || patch.settings !== undefined ? '' : value.output),
    } : value)
    if (patch.source !== undefined || patch.settings !== undefined) setOutputPage(0)
    if (patch.source !== undefined && resetEditor) setEditorEpoch(value => value + 1)
  }
  function setting(key: keyof Settings, value: string) {
    if (project) update({ settings: { ...project.settings, [key]: value }, ...(key === 'units' ? { output: project.output } : {}) })
  }
  async function openTool(selectedTool: Tool) {
    if (opening || busy) return
    if (!project) setOpening(true)
    try {
      Keyboard.dismiss()
      setSearchOpen(false)
      setConfigExpanded(true)
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      const current = project ?? await openWorkspace(db)
      const workspace = current.tool === selectedTool ? current : { ...current, tool: selectedTool, output: '' }
      pending.current = workspace
      setProject(workspace)
      setTool(selectedTool)
      setTab('Source')
      setOutputPage(0)
      setMessage('')
      void persist(workspace).catch(() => {
        setMessage('Could not save the tool selection. Your current file is still open.')
      })
    } catch (error) { report(error) }
    finally { if (!project) setOpening(false) }
  }
  async function newFile() {
    if (opening) return
    setOpening(true)
    try {
      const workspace = await createProject(db, tool)
      setProject(workspace)
      setTab('Source')
      setOutputPage(0)
      setMessage('')
    } catch (error) { report(error) }
    finally { setOpening(false) }
  }
  async function duplicate(file: Project) {
    try { await duplicateProject(db, file); await load() } catch (error) { report(error) }
  }
  function selectFile(file: Project) {
    pending.current = file
    setProject(file)
    setTool(file.tool)
    setTab('Source')
    setMessage('')
    setOutputPage(0)
    setSelectedLine(1)
  }
  const close = useCallback(async () => {
    try {
      if (project) await persist(project)
      pending.current = null
      setProject(null)
      await load()
    } catch (error) { report(error) }
  }, [project, persist, load])
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!project) return false
      void close()
      return true
    })
    return () => subscription.remove()
  }, [project, close])
  async function importFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
      if (result.canceled) return
      const asset = result.assets[0]
      if (!/\.(nc|gcode|txt)$/i.test(asset.name)) throw new Error('Choose a .nc, .gcode, or .txt file.')
      if ((asset.size ?? 0) > 1_000_000) throw new Error('Choose a file smaller than 1 MB.')
      const text = await new File(asset.uri).text()
      if (text.length > 1_000_000) throw new Error('Choose a smaller program.')
      update({ source: text, output: '', name: asset.name.replace(/\.[^.]+$/, '') })
      setMessage(text.includes('\uFFFD') ? 'Source contains invalid UTF-8 characters. Review before generating.' : '')
    } catch (error) { report(error) }
  }
  async function run() {
    if (!project || busy) return
    setBusy(true)
    setMessage('')
    try {
      await new Promise(resolve => setTimeout(resolve, 40))
      const output = generate(project.tool, project.source, project.settings)
      if (pending.current?.id !== project.id || pending.current.source !== project.source ||
          JSON.stringify(pending.current.settings) !== JSON.stringify(project.settings)) {
        throw new Error('The workspace changed while generating. Generate again using the current source.')
      }
      update({ output, ...(!project.source.trim() ? { source: samples[project.tool] } : {}) })
      setOutputPage(0)
      setTab('Output')
      setMessage('Generated ' + output.split('\n').length + ' lines.')
    } catch (error) { report(error) }
    finally { setBusy(false) }
  }
  async function share() {
    if (!project?.output) return
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable.')
      const name = project.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'program'
      const file = new File(Paths.cache, name + '.nc')
      await file.write(project.output)
      await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: 'Export NC program' })
    } catch (error) { report(error) }
  }
  function remove(target: Project) {
    Alert.alert('Delete project?', target.name + ' will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void deleteProject(db, target.id).then(load).catch(report) } },
    ])
  }
  async function flush() {
    if (pending.current) await persist(pending.current)
    await saveQueue.current
  }
  function viewCode(line: number) {
    setSelectedLine(line)
    setOutputPage(Math.floor((line - 1) / 200))
    setTab('Output')
    setFullscreen(false)
  }
  function clearSource() {
    Alert.alert('Clear source?', 'The current source will remain available in recovery history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', onPress: () => { void flush().then(() => update({ source: '', output: '' })).catch(report) } },
    ])
  }
  function closeParameters() {
    Keyboard.dismiss()
    setParametersOpen(false)
  }
  const field = (label: string, key: keyof Settings, linear = false) => {
    if (!project) return null
    return <NumericField key={key + project.settings.units} label={label} value={project.settings[key]}
      units={project.settings.units} linear={linear} rate={key !== 'spacing'} suffix={key === 'rotation' ? '\u00b0' : undefined} onChange={value => setting(key, value)} />
  }
  const parameterControls = project && <>
    <View style={s.unitsRow}>
      <Text style={s.caption}>Input units</Text>
      <View style={s.segment}>
        {(['mm', 'in'] as const).map(unit => <Pressable accessibilityRole="radio" accessibilityLabel={unit === 'mm' ? 'Millimeters (mm)' : 'Inches (in)'} accessibilityState={{ checked: project.settings.units === unit }} key={unit} onPress={() => { Keyboard.dismiss(); setting('units', unit) }} style={[s.unitTab, project.settings.units === unit && s.activeSegment]}>
          <Text style={[s.tabText, project.settings.units === unit && s.selectedText]}>{unit === 'mm' ? 'Millimeters (mm)' : 'Inches (in)'}</Text>
        </Pressable>)}
      </View>
    </View>
    <View style={s.row}>
      {field('Repetitions', 'repetitions')}
      {project.tool !== 'twoAxis' ? field('Y-axis spacing', 'spacing', true) : field('B-axis increment', 'rotation')}
    </View>
    {project.tool === 'twoAxis' && <View style={s.row}>
      {field('Rapid feedrate', 'rapid', true)}
      {field('Engraving feedrate', 'engraving', true)}
    </View>}
  </>
  const factor = project?.settings.units === 'in' ? 25.4 : 1
  const spacing = project ? Number(project.settings.spacing) / factor : 0
  const parameterSummary = project
    ? project.settings.repetitions + ' repeats / ' + (project.tool === 'twoAxis'
      ? 'B ' + project.settings.rotation + ' deg'
      : 'Y ' + (Number.isFinite(spacing) ? Number(spacing.toFixed(4)) : 'invalid') + ' ' + project.settings.units)
    : ''
  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
    {(!keyboardVisible || !project) && <View style={[s.header, expoGo && { paddingRight: 68 }]}>
      <View style={s.brandRow}>
        <Svg width={28} height={28} viewBox="0 0 28 28" accessibilityElementsHidden>
          <Circle cx={14} cy={14} r={9} stroke={colors.accent} strokeWidth={1.4} fill="none" />
          <Path d="M14 2v7m0 10v7M2 14h7m10 0h7" stroke={colors.accent} strokeWidth={1.4} />
        </Svg>
        <View style={{ flexShrink: 1 }}><Text numberOfLines={1} style={s.brand}>G-Code Forge</Text><Text numberOfLines={1} style={s.brandCaption}>Machining workspace</Text></View>
      </View>
      <View style={s.headerActions}>
        {project && <Button label="Workspace settings" icon="settings" iconOnly onPress={() => { Keyboard.dismiss(); setParametersOpen(true) }} />}
        <Button label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} icon={mode === 'dark' ? 'sun' : 'moon'} iconOnly onPress={toggleTheme} />
      </View>
    </View>}
    {!!received.length && project && <View style={s.panelToolbar}>
      <Text style={s.caption}>Local file received</Text>
      <Button label="Import shared file" disabled={busy} onPress={() => void importReceived()} />
      <Button label="Dismiss" onPress={() => { Sharing.clearSharedPayloads(); setReceived([]) }} />
    </View>}
    {opening ? <View style={[s.body, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.accent} /><Text accessibilityLiveRegion="polite" style={s.caption}>Opening workspace</Text></View> : !project ? <View style={s.flex}>
      <FlatList keyboardShouldPersistTaps="handled"
        data={projects.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()))}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 24 }}
        ListHeaderComponent={<View style={{ gap: 12, paddingBottom: 8 }}>
      <Text style={s.title}>Saved programs</Text>
      <Text style={s.caption}>Your code and settings, stored on this device.</Text>
      <View style={s.row}>
        <View style={s.summary}><Icon name="file" /><Text style={s.heading}>{projects.length} files</Text></View>
        <View style={s.summary}><Icon name="check" /><Text style={s.heading}>{projects.filter(item => item.output).length} with output</Text></View>
      </View>
      <TextInput style={s.input} value={search} onChangeText={setSearch} accessibilityLabel="Search saved programs" placeholder="Search programs" placeholderTextColor={colors.muted} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{tools.map(item => <Pressable accessibilityRole="button" accessibilityState={{ selected: tool === item.id }} style={[s.pill, tool === item.id && s.selected]} key={item.id} onPress={() => setTool(item.id)}><Text style={[s.tabText, tool === item.id && s.selectedText]}>{item.name}</Text></Pressable>)}</ScrollView>
      <View style={s.row}><Button primary icon="folder" label="Resume file" onPress={() => void openTool(tool)} /><Button icon="plus" label="New file" onPress={() => void newFile()} /></View>
      <WorkspaceTools project={null} onApply={update} onReload={load} onFlush={flush} />
        </View>}
        ListEmptyComponent={<Text style={s.caption}>{search ? 'No programs match your search.' : 'Select a tool to start.'}</Text>}
        renderItem={({ item }) => <View style={s.card}>
          <Pressable accessibilityRole="button" style={{ gap: 6 }} onPress={() => selectFile(item)}>
            <Text style={s.heading}>{item.name}</Text>
            <Text style={s.caption}>All 3 tools / {new Date(item.updated_at).toLocaleDateString()}</Text>
          </Pressable>
          <View style={s.row}><Button label="Open" onPress={() => selectFile(item)} /><Button label="Duplicate file" icon="copy" iconOnly onPress={() => void duplicate(item)} /><Button label="Delete file" icon="trash" iconOnly onPress={() => remove(item)} /></View>
        </View>} />
    </View> : <KeyboardAvoidingView style={s.flex}>
      <View style={s.toolsBar}>
        <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolTabs}>
          {tools.map(item => <Pressable accessibilityRole="tab" accessibilityState={{ selected: project.tool === item.id }} key={item.id} style={[s.toolTab, project.tool === item.id && s.activeTool]} onPress={() => { if (item.id !== project.tool) void openTool(item.id) }}>
            <Icon name={item.id === 'repeater' ? 'repeat' : item.id === 'converter' ? 'box' : 'target'} color={project.tool === item.id ? colors.accent : colors.muted} />
            <Text style={[s.tabText, project.tool === item.id && s.selectedText]}>{item.name}</Text>
          </Pressable>)}
        </ScrollView>
      </View>
      <View style={s.configCard}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: configExpanded }} accessibilityLabel="Toggle conversion parameters" onPress={() => { Keyboard.dismiss(); setConfigExpanded(value => !value) }} style={s.configHeader}>
          <Text style={s.sectionLabel}>Parameters</Text>
          {!configExpanded && <Text numberOfLines={1} style={[s.caption, { flexShrink: 1 }]}>{parameterSummary}</Text>}
          <Icon name={configExpanded ? 'chevronUp' : 'chevronDown'} size={16} color={colors.muted} />
        </Pressable>
        {configExpanded && <View style={s.configFields}>{parameterControls}</View>}
      </View>
      <View style={[s.workspaceFrame, split && { flexDirection: 'row' }]}>
        <View style={[s.flex, { minHeight: 0, backgroundColor: colors.editor }]}>
          <View style={s.workspaceTabs}>
            {(['Source', 'Output', 'Preview', 'Compare'] as const).map(item => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === item }} key={item} style={[s.workspaceTab, tab === item && s.activeWorkspaceTab]} onPress={() => { Keyboard.dismiss(); setTab(item) }}><Icon name={item === 'Source' ? 'code' : item === 'Output' ? 'file' : item === 'Preview' ? 'box' : 'compare'} size={16} color={tab === item ? colors.accent : colors.muted} /><Text style={[s.tabText, tab === item && s.selectedText]}>{item === 'Preview' ? 'Toolpath' : item}</Text></Pressable>)}
          </View>
          <View style={{ flex: 1, minHeight: 0, display: tab === 'Source' ? 'flex' : 'none' }}>
            <View style={s.panelToolbar}><Text style={s.panelLabel}>Source program</Text><View style={s.headerActions}>
              <Button label="Search, replace or jump to line" icon="search" iconOnly onPress={() => { Keyboard.dismiss(); setSearchOpen(true) }} />
              <Button label="Open G-code file" icon="folder" iconOnly onPress={() => void importFile()} />
              <Button label="Clear source" icon="trash" iconOnly onPress={clearSource} />
            </View></View>
            {project.source.includes('\uFFFD') && <View style={s.encoding}><Text style={s.caption}>Invalid characters in source</Text><Button label="Replace with spaces" icon="replace" onPress={() => update({ source: project.source.replace(/\uFFFD/g, ' ') })} /></View>}
            <Editor key={project.id + ':' + editorEpoch} value={project.source} onChange={source => update({ source }, false)} searchOpen={searchOpen} onCloseSearch={() => setSearchOpen(false)} onEditStart={() => setConfigExpanded(false)} />
          </View>
          {tab === 'Output' && <View style={[s.flex, { minHeight: 0 }]}>
            <View style={s.panelToolbar}><Text style={s.panelLabel}>Generated program</Text><View style={s.headerActions}><Button label="Copy generated code" icon="copy" iconOnly disabled={!project.output} onPress={() => { void Clipboard.setStringAsync(project.output).then(() => setMessage('Copied.')).catch(report) }} /><Button label="Export NC file" icon="export" iconOnly disabled={!project.output} onPress={() => void share()} /></View></View>
            {project.output ? <ScrollView ref={outputScroll} style={s.flex} nestedScrollEnabled>
              <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}><View style={{ paddingVertical: 8 }}>
                {project.output.split('\n').slice(outputPage * 200, outputPage * 200 + 200).map((line, index) => <Pressable accessibilityRole="button" accessibilityLabel={'Preview output line ' + (outputPage * 200 + index + 1)} key={index} style={[s.codeRow, selectedLine === outputPage * 200 + index + 1 && { backgroundColor: colors.selected }]} onPress={() => { setSelectedLine(outputPage * 200 + index + 1); setTab('Preview') }}><Text style={s.lineNumber}>{outputPage * 200 + index + 1}</Text><CodeLine line={line} /></Pressable>)}
              </View></ScrollView>
            </ScrollView> : <View style={[s.flex, s.empty]}><Icon name="file" /><Text style={s.heading}>Generated G-code appears here</Text><Text style={s.caption}>Review Parameters, then generate a program.</Text></View>}
            {project.output.split('\n').length > 200 && <View style={s.pagination}>
              <Button label="Previous 200 output lines" icon="previous" iconOnly disabled={outputPage === 0} onPress={() => { setOutputPage(value => value - 1); outputScroll.current?.scrollTo({ y: 0 }) }} />
              <Text style={s.caption}>Page {outputPage + 1} of {Math.ceil(project.output.split('\n').length / 200)}</Text>
              <Button label="Next 200 output lines" icon="next" iconOnly disabled={(outputPage + 1) * 200 >= project.output.split('\n').length} onPress={() => { setOutputPage(value => value + 1); outputScroll.current?.scrollTo({ y: 0 }) }} />
            </View>}
          </View>}
          {tab === 'Compare' && <ScrollView style={s.flex}>{project.output ? <Comparison key={project.output} source={project.source} output={project.output} /> : <View style={s.empty}><Text style={s.caption}>Generate a program to compare source and output.</Text></View>}</ScrollView>}
          {tab === 'Preview' && <ScrollView style={s.flex} scrollEnabled={!previewInteracting} contentContainerStyle={s.previewBody}>
            <Button label="Fullscreen toolpath" icon="expand" onPress={() => setFullscreen(true)} />
            {!split && !fullscreen && <Preview key={project.output + selectedLine} code={project.output} selectedLine={selectedLine} units={project.settings.units} onLine={viewCode} onInteracting={setPreviewInteracting} />}
          </ScrollView>}
          {(tab === 'Source' || tab === 'Output') && <View style={s.status}>
            <Text style={s.statusText}>{(tab === 'Source' ? project.source : project.output) ? (tab === 'Source' ? project.source : project.output).split('\n').length.toLocaleString() : '0'} lines / {(tab === 'Source' ? project.source.length : project.output.length).toLocaleString()} characters</Text>
            <Text style={[s.state, tab === 'Output' && !!project.output && s.generated]}>{tab === 'Source' ? project.source ? 'Editable' : 'Empty' : project.output ? 'Generated' : 'Empty'}</Text>
          </View>}
        </View>
        {split && <ScrollView style={s.flex} scrollEnabled={!previewInteracting} contentContainerStyle={s.body}>
          <Button label="Fullscreen preview" onPress={() => setFullscreen(true)} />
          {!fullscreen && <Preview key={project.output + selectedLine} code={project.output} selectedLine={selectedLine} units={project.settings.units} onLine={viewCode} onInteracting={setPreviewInteracting} />}
        </ScrollView>}
      </View>
      {!!message && <Text accessibilityLiveRegion="polite" numberOfLines={2} style={[s.caption, { paddingHorizontal: 12 }]}>{message}</Text>}
      <Modal visible={parametersOpen} animationType="slide" onRequestClose={closeParameters}>
        <SafeAreaView style={s.safe}>
          <View style={s.panelToolbar}><Text style={s.heading}>Parameters</Text><Button label="Close parameters" icon="close" iconOnly onPress={closeParameters} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.body, { padding: 16, gap: 16 }]}>
            <View style={s.projectRow}>
              <TextInput accessibilityLabel="Program name" style={s.programName} value={project.name} onChangeText={name => update({ name })} maxLength={100} />
              <Button label="Saved programs" icon="folder" onPress={() => { closeParameters(); void close() }} />
            </View>
            <Text style={s.heading}>{tools.find(item => item.id === project.tool)?.name}</Text>
            {parameterControls}
            <Button primary label="Use parameters" icon="check" onPress={closeParameters} />
            <WorkspaceTools project={project} onApply={update} onReload={load} onFlush={flush} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal visible={fullscreen} onRequestClose={() => { setFullscreen(false); setPreviewInteracting(false) }}>
        <SafeAreaView style={s.safe}>
          <Button label="Close fullscreen" onPress={() => { setFullscreen(false); setPreviewInteracting(false) }} />
          <ScrollView scrollEnabled={!previewInteracting} contentContainerStyle={s.body}>
            <Preview key={project.output + selectedLine} code={project.output} selectedLine={selectedLine} units={project.settings.units} onLine={viewCode} height={Math.max(280, height - 300)} onInteracting={setPreviewInteracting} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
      {!keyboardVisible && <View style={s.action}><Button primary disabled={busy} label={busy ? 'Generating...' : project.source.trim() ? 'Generate program' : 'Run default sample'} onPress={() => void run()} /><Text style={s.notice}>Review and simulate before machining.</Text></View>}
    </KeyboardAvoidingView>}
  </SafeAreaView>
}
export default function App() {
  return <SafeAreaProvider><SQLiteProvider databaseName="forge.db" onInit={migrate}><UiProvider><Workspace /></UiProvider></SQLiteProvider></SafeAreaProvider>
}
const makeStyles = (colors: Colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minHeight: 0 },
  header: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  brand: { color: colors.text, fontWeight: '700', fontSize: 16, letterSpacing: -.3 },
  brandCaption: { color: colors.faint, fontSize: 10, marginTop: 4 },
  body: { flexGrow: 1, padding: 12, gap: 12 },
  title: { color: colors.text, fontSize: 24, fontWeight: '600', letterSpacing: -.5 },
  heading: { color: colors.text, fontSize: 13, fontWeight: '600' },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  configCard: { marginHorizontal: 12, marginVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  configHeader: { minHeight: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  configFields: { gap: 12, paddingHorizontal: 12, paddingBottom: 12 },
  workspaceFrame: { flex: 1, minHeight: 0, marginHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.editor },
  caption: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  summary: { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pill: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 12 },
  selected: { borderColor: colors.accent, backgroundColor: colors.selected },
  card: { padding: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 12 },
  field: { flex: 1, minWidth: 110, gap: 4 },
  input: { borderWidth: 1, borderColor: colors.input, borderRadius: 6, color: colors.text, backgroundColor: colors.surface, padding: 12 },
  unitInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.input, borderRadius: 8, backgroundColor: colors.editor, minHeight: 44 },
  numberInput: { flex: 1, minWidth: 0, color: colors.text, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontVariant: ['tabular-nums'] },
  suffix: { color: colors.muted, fontSize: 10, paddingRight: 12 },
  codeRow: { flexDirection: 'row', minHeight: 21 },
  lineNumber: { width: 48, textAlign: 'right', paddingRight: 12, color: colors.faint, fontFamily: 'monospace', fontSize: 12, lineHeight: 21, includeFontPadding: false },
  action: { paddingHorizontal: 12, paddingTop: 0, paddingBottom: 8, gap: 8, backgroundColor: colors.background },
  notice: { color: colors.faint, fontSize: 10, textAlign: 'center' },
  toolsBar: { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  toolTabs: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' },
  toolTab: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'transparent', borderRadius: 6, justifyContent: 'center', paddingHorizontal: 12 },
  activeTool: { borderColor: colors.accent, backgroundColor: colors.selected },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '500' },
  selectedText: { color: colors.accent },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.border },
  programName: { flex: 1, minWidth: 0, color: colors.text, paddingHorizontal: 4, paddingVertical: 8, fontSize: 14, fontWeight: '500' },
  unitsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' },
  segment: { flexDirection: 'row', padding: 3, backgroundColor: colors.editor, borderWidth: 1, borderColor: colors.border, borderRadius: 6 },
  unitTab: { minWidth: 44, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  activeSegment: { backgroundColor: colors.selected },
  workspaceTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  workspaceTab: { flex: 1, minHeight: 44, gap: 4, paddingVertical: 4, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeWorkspaceTab: { borderBottomColor: colors.accent, backgroundColor: colors.selected },
  panelToolbar: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  panelLabel: { fontSize: 12, fontWeight: '600', color: colors.muted, flexShrink: 1 },
  encoding: { padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 8, borderTopWidth: 1, borderTopColor: colors.border },
  status: { minHeight: 28, paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  statusText: { color: colors.muted, fontFamily: 'monospace', fontSize: 10, flexShrink: 1 },
  state: { color: colors.muted, fontSize: 9 },
  generated: { color: colors.success },
  previewBody: { padding: 12, gap: 12, backgroundColor: colors.editor },
})
