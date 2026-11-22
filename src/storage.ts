import type { SQLiteDatabase } from 'expo-sqlite'
import { defaults, samples, type Settings, type Tool } from './gcode'

export type Project = {
  id: number
  name: string
  tool: Tool
  source: string
  output: string
  settings: Settings
  updated_at: string
}

type StoredProject = Omit<Project, 'settings'> & { settings: string }

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL;')
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  if ((version?.user_version ?? 0) < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          tool TEXT NOT NULL,
          source TEXT NOT NULL,
          output TEXT NOT NULL DEFAULT '',
          settings TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        PRAGMA user_version = 1;
      `)
    })
  }
  if ((version?.user_version ?? 0) < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS presets (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
          tool TEXT NOT NULL, settings TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS revisions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
          source TEXT NOT NULL, settings TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS revision_project ON revisions(project_id, id);
        PRAGMA user_version = 2;
      `)
    })
  }
  if ((version?.user_version ?? 0) < 3) {
    await db.execAsync('CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version = 3;')
  }
  if ((version?.user_version ?? 0) < 4) {
    await db.withExclusiveTransactionAsync(async transaction => {
      await transaction.execAsync('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;')
      const current = await transaction.getFirstAsync<{ id: number }>('SELECT id FROM projects ORDER BY updated_at DESC, id DESC LIMIT 1')
      const starters = await transaction.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM projects WHERE name = 'Untitled program'")
      if (current && (starters?.total ?? 0) > 1) {
        await transaction.runAsync("UPDATE projects SET archived = 1 WHERE name = 'Untitled program' AND id <> ?", current.id)
      }
      await transaction.execAsync('PRAGMA user_version = 4;')
    })
  }
}

export async function listProjects(db: SQLiteDatabase, archived = false): Promise<Project[]> {
  const rows = await db.getAllAsync<StoredProject>('SELECT * FROM projects WHERE archived = ? ORDER BY updated_at DESC, id DESC', archived ? 1 : 0)
  return rows.map(row => ({ ...row, settings: { ...defaults, ...JSON.parse(row.settings) } }))
}

export async function createProject(db: SQLiteDatabase, tool: Tool): Promise<Project> {
  const project = { name: 'My program', tool, source: samples[tool], output: '', settings: { ...defaults }, updated_at: new Date().toISOString() }
  const result = await db.runAsync(
    'INSERT INTO projects (name, tool, source, output, settings, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    project.name, project.tool, project.source, project.output, JSON.stringify(project.settings), project.updated_at,
  )
  return { ...project, id: result.lastInsertRowId }
}

export async function openWorkspace(db: SQLiteDatabase, tool?: Tool): Promise<Project> {
  let project: Project | undefined
  await db.withExclusiveTransactionAsync(async transaction => {
    const row = await transaction.getFirstAsync<StoredProject>('SELECT * FROM projects WHERE archived = 0 ORDER BY updated_at DESC, id DESC LIMIT 1')
    project = row
      ? { ...row, settings: { ...defaults, ...JSON.parse(row.settings) } }
      : await createProject(transaction, tool ?? 'repeater')
    if (tool && project.tool !== tool) {
      project = { ...project, tool, output: '' }
      await transaction.runAsync('UPDATE projects SET tool = ?, output = ? WHERE id = ?', tool, '', project.id)
    }
  })
  return project!
}

export async function saveProject(db: SQLiteDatabase, project: Project) {
  await db.withExclusiveTransactionAsync(async transaction => {
    const previous = await transaction.getFirstAsync<{ source: string; settings: string }>('SELECT source, settings FROM projects WHERE id = ?', project.id)
    if (previous && (previous.source !== project.source || previous.settings !== JSON.stringify(project.settings))) {
      await transaction.runAsync(
        'INSERT INTO revisions (project_id, source, settings, created_at) VALUES (?, ?, ?, ?)',
        project.id, previous.source, previous.settings, new Date().toISOString(),
      )
      await transaction.runAsync('DELETE FROM revisions WHERE project_id = ? AND id NOT IN (SELECT id FROM revisions WHERE project_id = ? ORDER BY id DESC LIMIT 10)', project.id, project.id)
    }
    await transaction.runAsync(
    'UPDATE projects SET name = ?, tool = ?, source = ?, output = ?, settings = ?, updated_at = ? WHERE id = ?',
    project.name, project.tool, project.source, project.output, JSON.stringify(project.settings), new Date().toISOString(), project.id,
  )
  })
}

export async function switchTool(db: SQLiteDatabase, project: Project, tool: Tool): Promise<Project> {
  const updated = { ...project, tool, output: '' }
  await saveProject(db, updated)
  return updated
}

export async function duplicateProject(db: SQLiteDatabase, project: Project) {
  const result = await db.runAsync(
    'INSERT INTO projects (name, tool, source, output, settings, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    (project.name + ' copy').slice(0, 100), project.tool, project.source, project.output, JSON.stringify(project.settings), new Date().toISOString(),
  )
  return { ...project, id: result.lastInsertRowId, name: (project.name + ' copy').slice(0, 100) }
}
export type Preset = { id: number; name: string; tool: Tool; settings: Settings }
export type Revision = { id: number; source: string; settings: Settings; created_at: string }

export async function listPresets(db: SQLiteDatabase): Promise<Preset[]> {
  const rows = await db.getAllAsync<Omit<Preset, 'settings'> & { settings: string }>('SELECT * FROM presets ORDER BY name, id')
  return rows.map(row => ({ ...row, settings: JSON.parse(row.settings) }))
}

export async function listRevisions(db: SQLiteDatabase, projectId: number): Promise<Revision[]> {
  const rows = await db.getAllAsync<Omit<Revision, 'settings'> & { settings: string }>('SELECT * FROM revisions WHERE project_id = ? ORDER BY id DESC', projectId)
  return rows.map(row => ({ ...row, settings: JSON.parse(row.settings) }))
}

export async function deleteProject(db: SQLiteDatabase, id: number) {
  await db.withExclusiveTransactionAsync(async transaction => {
    await transaction.runAsync('DELETE FROM revisions WHERE project_id = ?', id)
    await transaction.runAsync('DELETE FROM projects WHERE id = ?', id)
  })
}

export async function backup(db: SQLiteDatabase): Promise<string> {
  const projects = [...await listProjects(db), ...await listProjects(db, true)]
  const presets = await listPresets(db)
  if (projects.length > 500 || presets.length > 500) throw new Error('Backups support up to 500 programs and 500 presets.')
  const content = JSON.stringify({
    format: 'gcode-forge', version: 1,
    projects, presets,
  })
  if (content.length > 20_000_000) throw new Error('Backup exceeds 20 MB. Export individual programs first.')
  return content
}

function settingsFrom(value: unknown): Settings {
  if (!value || typeof value !== 'object') throw new Error('Invalid backup settings.')
  const record = value as Record<string, unknown>
  for (const key of Object.keys(defaults)) if (typeof record[key] !== 'string' || (record[key] as string).length > 128) throw new Error('Invalid backup settings.')
  if (record.units !== 'mm' && record.units !== 'in') throw new Error('Invalid backup units.')
  return Object.fromEntries(Object.keys(defaults).map(key => [key, record[key]])) as Settings
}

export function readBackup(content: string) {
  if (content.length > 20_000_000) throw new Error('Backup exceeds 20 MB.')
  const data = JSON.parse(content)
  if (data?.format !== 'gcode-forge' || data.version !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.presets) || data.projects.length > 500 || data.presets.length > 500) throw new Error('Choose a valid G-Code Forge backup.')
  const toolFrom = (value: unknown): Tool => {
    if (value !== 'repeater' && value !== 'converter' && value !== 'twoAxis') throw new Error('Invalid backup tool.')
    return value
  }
  const projects = data.projects.map((item: Record<string, unknown>) => {
    if (!item || typeof item.name !== 'string' || item.name.length > 100 ||
        typeof item.source !== 'string' || item.source.length > 1_000_000 ||
        typeof item.output !== 'string' || item.output.length > 4_000_000) throw new Error('Invalid backup program.')
    return { name: item.name, tool: toolFrom(item.tool), source: item.source, output: item.output, settings: settingsFrom(item.settings), archived: item.archived === 1 || item.archived === true ? 1 : 0 }
  })
  const presets = data.presets.map((item: Record<string, unknown>) => {
    if (!item || typeof item.name !== 'string' || item.name.length > 100) throw new Error('Invalid preset.')
    return { name: item.name, tool: toolFrom(item.tool), settings: settingsFrom(item.settings) }
  })
  return { projects, presets }
}

export async function restoreBackup(db: SQLiteDatabase, content: string) {
  const data = readBackup(content)
  let restored = 0
  await db.withExclusiveTransactionAsync(async transaction => {
    for (const project of data.projects) {
      const settings = JSON.stringify(project.settings)
      const existing = await transaction.getFirstAsync('SELECT id FROM projects WHERE name = ? AND tool = ? AND source = ? AND output = ? AND settings = ?', project.name, project.tool, project.source, project.output, settings)
      if (!existing) {
        await transaction.runAsync('INSERT INTO projects (name, tool, source, output, settings, updated_at, archived) VALUES (?, ?, ?, ?, ?, ?, ?)', project.name, project.tool, project.source, project.output, settings, new Date().toISOString(), project.archived)
        restored++
      }
    }
    for (const preset of data.presets) {
      const settings = JSON.stringify(preset.settings)
      const existing = await transaction.getFirstAsync('SELECT id FROM presets WHERE name = ? AND tool = ? AND settings = ?', preset.name, preset.tool, settings)
      if (!existing) await transaction.runAsync('INSERT INTO presets (name, tool, settings) VALUES (?, ?, ?)', preset.name, preset.tool, settings)
    }
  })
  return restored
}
