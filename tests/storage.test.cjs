const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const ts = require('typescript')
const test = require('node:test')

function load(name) {
  const module = { exports: {} }
  const source = fs.readFileSync(path.resolve(__dirname, '../src', name + '.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  new Function('require', 'module', 'exports', outputText)(name => load(name.replace('./', '')), module, module.exports)
  return module.exports
}
function database() {
  const sqlite = new DatabaseSync(':memory:')
  const db = {
    execAsync: async sql => sqlite.exec(sql),
    getFirstAsync: async (sql, ...args) => sqlite.prepare(sql).get(...args),
    getAllAsync: async (sql, ...args) => sqlite.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => {
      const result = sqlite.prepare(sql).run(...args)
      return { lastInsertRowId: Number(result.lastInsertRowid) }
    },
    withTransactionAsync: async callback => {
      sqlite.exec('BEGIN')
      try { await callback(); sqlite.exec('COMMIT') } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
    withExclusiveTransactionAsync: async callback => db.withTransactionAsync(() => callback(db)),
  }
  return { db, close: () => sqlite.close() }
}
const store = load('storage')

test('opening a tool reuses its workspace and preserves edits', async () => {
  const { db, close } = database()
  try {
    await store.migrate(db)
    const first = await store.openWorkspace(db)
    first.source = 'G1 X42'
    await store.saveProject(db, first)
    const resumed = await store.openWorkspace(db, 'repeater')
    assert.equal(resumed.id, first.id)
    assert.equal(resumed.source, 'G1 X42')
    await store.openWorkspace(db, 'converter')
    await store.openWorkspace(db, 'converter')
    assert.equal((await store.listProjects(db)).length, 1)
  } finally { close() }
})
test('old installations migrate without losing saved programs', async () => {
  const { db, close } = database()
  try {
    await db.execAsync('CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, tool TEXT, source TEXT, output TEXT, settings TEXT, updated_at TEXT); PRAGMA user_version=1;')
    await store.migrate(db)
    await store.migrate(db)
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 4)
    assert.deepEqual(await store.listPresets(db), [])
    await db.runAsync("INSERT OR REPLACE INTO preferences (key, value) VALUES ('theme', ?)", 'light')
    await store.migrate(db)
    assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'theme'")).value, 'light')
  } finally { close() }
})

test('legacy per-tool untitled files consolidate without losing their edited code', async () => {
  const { db, close } = database()
  try {
    await store.migrate(db)
    const rows = []
    for (const tool of ['repeater', 'converter', 'twoAxis']) {
      const file = await store.createProject(db, tool)
      await db.runAsync('UPDATE projects SET name = ?, source = ? WHERE id = ?', 'Untitled program', 'Edited ' + tool, file.id)
      rows.push(file)
    }
    await db.execAsync('ALTER TABLE projects DROP COLUMN archived; PRAGMA user_version = 3;')
    await store.migrate(db)
    await store.migrate(db)
    const active = await store.listProjects(db)
    const recovered = await store.listProjects(db, true)
    assert.equal(active.length, 1)
    assert.equal(recovered.length, 2)
    assert.equal(active[0].source, 'Edited twoAxis')
    assert.deepEqual(recovered.map(row => row.source).sort(), ['Edited converter', 'Edited repeater'])
    for (const tool of ['repeater', 'converter', 'twoAxis']) await store.openWorkspace(db, tool)
    assert.equal((await store.listProjects(db)).length, 1)
    assert.equal((await store.listProjects(db, true)).length, 2)
    const content = await store.backup(db)
    assert.equal(JSON.parse(content).projects.length, 3)
    const restored = database()
    try {
      await store.migrate(restored.db)
      await store.restoreBackup(restored.db, content)
      assert.equal((await store.listProjects(restored.db)).length, 1)
      assert.equal((await store.listProjects(restored.db, true)).length, 2)
    } finally { restored.close() }
  } finally { close() }
})

test('duplicate is explicit and preserves the original file', async () => {
  const { db, close } = database()
  try {
    await store.migrate(db)
    const original = await store.openWorkspace(db)
    original.name = 'Bracket'
    original.source = 'G1 X12.5'
    await store.saveProject(db, original)
    const copy = await store.duplicateProject(db, original)
    assert.notEqual(copy.id, original.id)
    const files = await store.listProjects(db)
    assert.equal(files.length, 2)
    assert.equal(files.find(file => file.id === original.id).name, 'Bracket')
    assert.equal(files.find(file => file.id === copy.id).source, 'G1 X12.5')
  } finally { close() }
})

test('switching all tools keeps one file, its name, source and settings', async () => {
  const { db, close } = database()
  try {
    await store.migrate(db)
    let project = await store.openWorkspace(db)
    project.name = 'Bracket'
    project.source = 'G1 X42'
    project.settings.spacing = '8'
    const id = project.id
    for (const tool of ['converter', 'twoAxis', 'repeater']) {
      project = await store.switchTool(db, project, tool)
      assert.equal(project.id, id)
      assert.equal(project.name, 'Bracket')
      assert.equal(project.source, 'G1 X42')
      assert.equal(project.settings.spacing, '8')
      assert.equal(project.output, '')
    }
    assert.equal((await store.listProjects(db)).length, 1)
    assert.equal((await store.openWorkspace(db)).id, id)
  } finally { close() }
})
test('recovery keeps ten previous versions and project deletion clears them', async () => {
  const { db, close } = database()
  try {
    await store.migrate(db)
    const project = await store.createProject(db, 'repeater')
    const original = project.source
    project.source = 'G1 X1'
    await store.saveProject(db, project)
    assert.equal((await store.listRevisions(db, project.id))[0].source, original)
    for (let i = 2; i <= 15; i++) { project.source = 'G1 X' + i; await store.saveProject(db, project) }
    const revisions = await store.listRevisions(db, project.id)
    assert.equal(revisions.length, 10)
    assert.equal(revisions[0].source, 'G1 X14')
    await store.deleteProject(db, project.id)
    assert.equal((await store.listRevisions(db, project.id)).length, 0)
    assert.equal((await store.listProjects(db)).length, 0)
  } finally { close() }
})
test('backup restores programs and presets, preserves existing data, and skips duplicate imports', async () => {
  const one = database(), two = database()
  try {
    await store.migrate(one.db); await store.migrate(two.db)
    const project = await store.createProject(one.db, 'converter')
    project.name = "O'Brien"
    project.source = 'G1 X25.4'
    project.settings.units = 'in'
    await store.saveProject(one.db, project)
    await one.db.runAsync('INSERT INTO presets (name, tool, settings) VALUES (?, ?, ?)', 'Small part', 'converter', JSON.stringify(project.settings))
    const content = await store.backup(one.db)
    await store.createProject(two.db, 'twoAxis')
    assert.equal(await store.restoreBackup(two.db, content), 1)
    assert.equal(await store.restoreBackup(two.db, content), 0)
    const restored = await store.listProjects(two.db)
    assert.equal(restored.length, 2)
    assert.equal(restored.find(row => row.name === "O'Brien").settings.units, 'in')
    assert.equal((await store.listPresets(two.db)).length, 1)
  } finally { one.close(); two.close() }
})
test('invalid backups are rejected before changing the database', async () => {
  const { db, close } = database()
  try {
    await store.migrate(db)
    assert.throws(() => store.readBackup('{"version":2}'))
    await assert.rejects(store.restoreBackup(db, JSON.stringify({ format: 'gcode-forge', version: 1, projects: [{ name: 'Bad', tool: 'wrong', source: '', output: '' }], presets: [] })))
    assert.equal((await store.listProjects(db)).length, 0)
  } finally { close() }
})
