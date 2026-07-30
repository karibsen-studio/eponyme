export function middleEllipsis(value: string, maxLength = 28) {
  const characters = [...value]
  if (characters.length <= maxLength) return value
  const available = maxLength - 1
  const startLength = Math.ceil(available / 2)
  const endLength = Math.floor(available / 2)
  return `${characters.slice(0, startLength).join('')}…${characters.slice(-endLength).join('')}`
}
