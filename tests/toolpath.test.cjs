const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const test = require('node:test')

const moduleUnderTest = { exports: {} }
const source = fs.readFileSync(path.join(__dirname, '../src/toolpath.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
new Function('module', 'exports', compiled.outputText)(moduleUnderTest, moduleUnderTest.exports)
const { parseToolpath } = moduleUnderTest.exports
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, actual + ' != ' + expected)

test('inch and incremental coordinates normalize to mm', () => {
  const result = parseToolpath('G20 G90\nG1 X1 F60\nG91\nX1\nG21\nX1')
  assert.equal(result.warnings.length, 0)
  near(result.moves.at(-1).to[0], 51.8)
  near(result.cutDistance, 51.8)
})
test('G2/G3 IJK quarter arcs and helices preserve endpoints', () => {
  const result = parseToolpath('G21 G90\nG0 X10\nG3 X0 Y10 Z2 I-10 J0 F600')
  assert.equal(result.warnings.length, 0)
  const end = result.moves.at(-1).to
  near(end[0], 0); near(end[1], 10); near(end[2], 2)
  near(result.cutDistance, Math.hypot(Math.PI * 5, 2), .01)
  near(result.rapidDistance, 10)
  near(result.feedSeconds, result.cutDistance / 600 * 60)
  assert.equal(result.moves.at(-1).line, 3)
})
test('signed R arcs select short and long sweeps', () => {
  const short = parseToolpath('G0 X10\nG3 X0 Y10 R10 F600')
  const long = parseToolpath('G0 X10\nG3 X0 Y10 R-10 F600')
  near(short.cutDistance, Math.PI * 5, .01)
  near(long.cutDistance, Math.PI * 15, .02)
})
test('full-circle arcs and all arc planes are supported', () => {
  for (const code of ['G17\nG0 X10\nG2 I-10 J0 F600', 'G18\nG0 Z10\nG2 K-10 I0 F600', 'G19\nG0 Y10\nG2 J-10 K0 F600']) {
    const result = parseToolpath(code)
    assert.equal(result.warnings.length, 0)
    near(result.cutDistance, Math.PI * 20, .02)
  }
})
test('unsafe or unsupported modes stop with a line-specific warning', () => {
  const result = parseToolpath('G1 X1 F100\nG81 X2 Z-4\nX10')
  assert.equal(result.moves.length, 1)
  assert.match(result.warnings[0], /Line 2.*G81/)
  assert.equal(result.feedSeconds, null)
})
test('invalid arc radius is reported and program end stops playback', () => {
  assert.match(parseToolpath('G2 X100 R1').warnings[0], /invalid R arc/)
  const result = parseToolpath('G1 X1 F100\nM30\nX100')
  assert.equal(result.moves.length, 1)
  near(result.cutDistance, 1)
  assert.equal(parseToolpath('N1G1X1F100\nN2M30\nN3X100').moves.length, 1)
})
test('absolute arc centers and B rotation retain machine coordinates', () => {
  const arc = parseToolpath('G0 X10\nG90.1 G3 X0 Y10 I0 J0 F100')
  assert.equal(arc.warnings.length, 0)
  const turn = parseToolpath('G1 X10 F100\nB90')
  near(turn.moves.at(-1).to[0], 0)
  near(turn.moves.at(-1).to[2], 10)
  assert.equal(turn.feedSeconds, null)
})
