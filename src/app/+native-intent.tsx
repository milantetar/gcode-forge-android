export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (path.includes('expo-sharing')) return '/'
  return path
}
