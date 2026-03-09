// Bullet symbols by indent level (spec 6.1)
const BULLETS = ['●', '□', '△', '◇']

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)-/)
  if (!match) return -1
  return Math.floor(match[1].length / 2)
}

function isCheckbox(line: string): boolean {
  return /^\s*\[[ xX]\]/.test(line)
}

function formatCheckboxLine(line: string): string {
  const match = line.match(/^(\s*)\[([ xX])\]\s*(.*)$/)
  if (!match) return line
  const [, indent, state, text] = match
  const box = state.toLowerCase() === 'x' ? '☑' : '☐'
  return indent + box + ' ' + (text ?? '')
}

export function formatNoteDisplay(raw: string): string {
  if (!raw.trim()) return ''
  return raw
    .split('\n')
    .map((line) => {
      if (isCheckbox(line)) return formatCheckboxLine(line)
      const level = getIndentLevel(line)
      if (level >= 0) {
        const bullet = BULLETS[Math.min(level, BULLETS.length - 1)]
        const text = line.replace(/^\s*-\s*/, '').trim()
        return '  '.repeat(level) + bullet + ' ' + text
      }
      return line
    })
    .join('\n')
}

export function parseBulletLine(line: string): { indent: number; text: string } | null {
  const match = line.match(/^(\s*)-?\s*(.*)$/)
  if (!match) return null
  const indent = Math.floor((match[1].match(/\s/g)?.length ?? 0) / 2)
  return { indent, text: match[2] }
}
