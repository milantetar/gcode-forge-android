const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function load(file) {
  const filename = path.resolve(__dirname, file)
  const module = { exports: {} }
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  new Function('require', 'module', 'exports', result.outputText)(
    name => load('../src/' + name.replace('./', '') + '.ts'), module, module.exports,
  )
  return module.exports
}

const { defaults, generate, samples } = load('../src/gcode.ts')

test('one shared source file can run through all three tools', () => {
  for (const tool of ['repeater', 'converter', 'twoAxis']) {
    const output = generate(tool, samples.repeater, defaults)
    assert.ok(output.length > 0)
  }
})

test('repeater matches the existing website golden output byte for byte', () => {
  const expected = fs.readFileSync(path.resolve(__dirname, 'fixtures/repeater-default-output.nc'), 'utf8')
  assert.equal(generate('repeater', samples.repeater, { ...defaults, repetitions: '1', spacing: '0' }), expected)
})

for (const tool of ['repeater', 'converter', 'twoAxis']) {
  test(tool + ' uses its sample for blank input and ignores display units', () => {
    const expected = generate(tool, samples[tool], defaults)
    assert.ok(expected.length > 0)
    assert.equal(generate(tool, '', defaults), expected)
    assert.equal(generate(tool, '  \n', defaults), expected)
    assert.equal(generate(tool, samples[tool], { ...defaults, units: 'in' }), expected)
  })
  test(tool + ' rejects unsafe repetition counts', () => {
    for (const repetitions of ['0', '-1', '1001', '1.5', '']) {
      assert.throws(() => generate(tool, '', { ...defaults, repetitions }))
    }
  })
}
