// Bound synchronous work before allocating repeated output or blocking the UI.
export function validateGcodeJob(source: string, repetitions: string, settings: string[]) {
  const count = Number(repetitions)
  if (!source.trim()) throw new Error('Paste source G-code first.')
  if (!repetitions.trim() || !Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error('Repetitions must be a whole number between 1 and 1,000.')
  }
  if (settings.some(value => !value.trim() || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1_000_000)) {
    throw new Error('Enter valid settings between −1,000,000 and 1,000,000.')
  }
  if (source.length > 1_000_000 || source.length * count > 4_000_000 || source.split('\n').length * count > 100_000) {
    throw new Error('This job is too large for the browser. Use a smaller source or fewer repetitions (100,000 source lines across repetitions maximum).')
  }
  return count
}
