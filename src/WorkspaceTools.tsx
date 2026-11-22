import { ActionButton as Action, useUi } from './ui'
import { useState } from 'react'
import { Alert, Modal, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSQLiteContext } from 'expo-sqlite'
import { File, Paths } from 'expo-file-system'
import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import { backup, listPresets, listProjects, listRevisions, restoreBackup, type Preset, type Project, type Revision } from './storage'
import { tools } from './gcode'


export function WorkspaceTools({ project, onApply, onReload, onFlush }: {
  project: Project | null
  onApply: (patch: Partial<Project>) => void
  onReload: () => Promise<void>
  onFlush: () => Promise<void>
}) {
  const { colors } = useUi()
  const db = useSQLiteContext()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [presets, setPresets] = useState<Preset[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [earlierFiles, setEarlierFiles] = useState<Project[]>([])
  async function refresh() {
    setPresets(await listPresets(db))
    setRevisions(project ? await listRevisions(db, project.id) : [])
    setEarlierFiles(await listProjects(db, true))
  }
  async function task(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try { await action() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Operation failed.') }
    finally { setBusy(false) }
  }
  return <>
    <Action label={project ? 'Presets & recovery' : 'Backup & restore'} onPress={() => { setVisible(true); void task(async () => { await onFlush(); await refresh() }) }} />
    <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) setVisible(false) }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>Workspace tools</Text>
          <Action label="Close" disabled={busy} onPress={() => setVisible(false)} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Action label="Export all projects" disabled={busy} onPress={() => void task(async () => {
              await onFlush()
              if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable.')
              const file = new File(Paths.cache, 'gcode-forge-backup.json')
              await file.write(await backup(db))
              await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save project backup' })
              setMessage('Backup contains all programs and presets.')
            })} />
            <Action label="Restore backup" disabled={busy} onPress={() => void task(async () => {
              const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
              if (result.canceled) return
              const asset = result.assets[0]
              const file = new File(asset.uri)
              if ((asset.size ?? file.size) > 20_000_000) throw new Error('Backup exceeds 20 MB.')
              await onFlush()
              const restored = await restoreBackup(db, await file.text())
              await refresh()
              await onReload()
              setMessage('Restored ' + restored + ' programs. Existing programs were kept.')
            })} />
          </View>
          {earlierFiles.length > 0 && <>
            <Text style={{ color: colors.text, fontSize: 16 }}>Earlier tool files</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>These files were created by the earlier per-tool workflow. Their code and settings are preserved here.</Text>
            {earlierFiles.map(file => <Action key={file.id} label={'Recover ' + (tools.find(tool => tool.id === file.tool)?.name ?? file.name) + ' / ' + new Date(file.updated_at).toLocaleDateString()} disabled={busy} onPress={() => void task(async () => {
              await db.runAsync('UPDATE projects SET archived = 0, name = ? WHERE id = ?', 'Recovered ' + (tools.find(tool => tool.id === file.tool)?.name ?? 'program'), file.id)
              await refresh()
              await onReload()
              setMessage('Earlier file recovered to Saved programs.')
            })} />)}
          </>}
          {project && <>
            <Text style={{ color: colors.accent, fontSize: 16 }}>Parameter presets</Text>
            <TextInput accessibilityLabel="Preset name" placeholder="Preset name" placeholderTextColor={colors.muted} maxLength={100} value={name} onChangeText={setName} style={{ padding: 10, color: colors.text, borderWidth: 1, borderColor: colors.input, borderRadius: 6 }} />
            <Action label="Save current parameters" disabled={busy || !name.trim()} onPress={() => void task(async () => {
              await db.runAsync('INSERT INTO presets (name, tool, settings) VALUES (?, ?, ?)', name.trim(), project.tool, JSON.stringify(project.settings))
              setName('')
              await refresh()
              setMessage('Preset saved.')
            })} />
            {presets.filter(preset => preset.tool === project.tool).map(preset => <View key={preset.id} style={{ gap: 6, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 6 }}>
              <Text style={{ color: colors.text }}>{preset.name}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Action label="Apply" disabled={busy} onPress={() => { onApply({ settings: preset.settings }); setVisible(false) }} />
                <Action label="Delete" disabled={busy} onPress={() => Alert.alert('Delete preset?', preset.name, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void task(async () => { await db.runAsync('DELETE FROM presets WHERE id = ?', preset.id); await refresh() }) }])} />
              </View>
            </View>)}
            <Text style={{ color: colors.accent, fontSize: 16 }}>Recover a saved version</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>The last 10 source and parameter versions are stored on this device.</Text>
            {revisions.length === 0 && <Text style={{ color: colors.muted }}>No previous versions yet.</Text>}
            {revisions.map(revision => <Action key={revision.id} label={new Date(revision.created_at).toLocaleString() + ' · ' + revision.source.split('\n').length + ' lines'} disabled={busy} onPress={() => Alert.alert('Restore this version?', 'Your current source is saved in recovery history.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Restore', onPress: () => void task(async () => { await onFlush(); onApply({ source: revision.source, settings: revision.settings }); setVisible(false) }) }])} />)}
          </>}
          {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{message}</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>
}
