import { useRef, useCallback, useEffect } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  onBlur?: (value: string) => void
  onEnterSave?: (value: string) => void
  placeholder?: string
}

const INDENT = 2
const BULLETS = ['●', '□', '△', '◇']

function isBullet(line: string): boolean {
  return /^\s*-\s/.test(line) || /^\s*-\s*$/.test(line)
}

function getIndent(line: string): number {
  const m = line.match(/^(\s*)-/)
  return m ? m[1].length : 0
}

function getContentStart(line: string): number {
  if (!isBullet(line)) return 0
  const m = line.match(/^(\s*-\s*)/)
  return m ? m[1].length : 0
}

function makeBullet(indent: number, content = ''): string {
  return ' '.repeat(indent) + '- ' + content
}

function getDisplayLine(line: string): string {
  if (!isBullet(line)) return line
  const indent = getIndent(line)
  const level = indent / 2
  const bullet = BULLETS[Math.min(level, BULLETS.length - 1)]
  const content = line.replace(/^\s*-\s*/, '')
  return ' '.repeat(indent) + bullet + ' ' + content
}

const MIN_ROWS = 4

export default function NoteEditor({ value, onChange, onBlur, onEnterSave, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    const style = getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5
    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    const minHeight = lineHeight * MIN_ROWS + paddingY
    el.style.height = '0'
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`
  }, [])

  useEffect(() => {
    resize()
  }, [value, resize])

  function getLineAt(pos: number): { line: string; lineIdx: number; lineStart: number; colInLine: number } | null {
    const el = ref.current
    if (!el) return null
    const lines = el.value.split('\n')
    let lineStart = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      const lineEnd = lineStart + line.length
      if (pos >= lineStart && pos <= lineEnd) {
        return { line, lineIdx: i, lineStart, colInLine: pos - lineStart }
      }
      lineStart = lineEnd + 1
    }
    return null
  }

  const clampCursor = useCallback(() => {
    const el = ref.current
    if (!el) return
    const v = el.value
    const lines = v.split('\n')
    let start = el.selectionStart
    let end = el.selectionEnd
    let lineStart = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      const lineEnd = lineStart + line.length
      if (isBullet(line)) {
        const min = lineStart + getContentStart(line)
        if (start >= lineStart && start <= lineEnd && start < min) start = min
        if (end >= lineStart && end <= lineEnd && end < min) end = min
      }
      lineStart = lineEnd + 1
    }
    if (start > end) start = end
    if (el.selectionStart !== start || el.selectionEnd !== end) {
      el.setSelectionRange(start, end)
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = ref.current
    if (!el) return
    const pos = el.selectionStart
    const info = getLineAt(pos)
    if (!info) return
    const { line, lineIdx, lineStart, colInLine } = info
    const lines = el.value.split('\n')
    const contentStart = getContentStart(line)
    const minPos = lineStart + contentStart

    // Tab: indent / Shift+Tab: outdent
    if (e.key === 'Tab' && isBullet(line)) {
      e.preventDefault()
      const indent = getIndent(line)
      const content = line.slice(contentStart)
      const newIndent = e.shiftKey ? Math.max(0, indent - INDENT) : indent + INDENT
      lines[lineIdx] = makeBullet(newIndent, content)
      const newValue = lines.join('\n')
      el.value = newValue
      onChange(newValue)
      const newPos = lineStart + newIndent + 2 + Math.min(colInLine - contentStart, content.length)
      el.setSelectionRange(newPos, newPos)
      return
    }

    // Enter: new bullet at same level
    if (e.key === 'Enter' && isBullet(line)) {
      e.preventDefault()
      const indent = getIndent(line)
      const content = line.slice(contentStart)
      const before = content.slice(0, colInLine - contentStart)
      const after = content.slice(colInLine - contentStart)
      lines[lineIdx] = makeBullet(indent, before)
      lines.splice(lineIdx + 1, 0, makeBullet(indent, after))
      const newValue = lines.join('\n')
      el.value = newValue
      onChange(newValue)
      onEnterSave?.(newValue)
      const newPos = lineStart + line.length + 1 + indent + 2
      el.setSelectionRange(newPos, newPos)
      return
    }

    // Enter: plain text - save after default newline
    if (e.key === 'Enter' && !isBullet(line)) {
      const v = el.value
      setTimeout(() => onEnterSave?.(ref.current?.value ?? v), 0)
    }

    // Backspace
    if (e.key === 'Backspace' && el.selectionStart === el.selectionEnd) {
      if (colInLine < contentStart && isBullet(line)) {
        e.preventDefault()
        el.setSelectionRange(minPos, minPos)
        return
      }
      if (isBullet(line)) {
        const content = line.slice(contentStart)
        const isEmpty = content.trim() === ''
        if (isEmpty) {
          e.preventDefault()
          const indent = getIndent(line)
          if (indent >= INDENT) {
            lines[lineIdx] = makeBullet(indent - INDENT)
            const newValue = lines.join('\n')
            el.value = newValue
            onChange(newValue)
            el.setSelectionRange(lineStart + indent - INDENT + 2, lineStart + indent - INDENT + 2)
          } else {
            lines.splice(lineIdx, 1)
            const newValue = lines.join('\n')
            el.value = newValue
            onChange(newValue)
            el.setSelectionRange(lineStart, lineStart)
          }
          return
        }
        if (colInLine <= contentStart) {
          e.preventDefault()
          const indent = getIndent(line)
          if (indent >= INDENT) {
            lines[lineIdx] = makeBullet(indent - INDENT, content.trim())
            const newValue = lines.join('\n')
            el.value = newValue
            onChange(newValue)
            el.setSelectionRange(lineStart + indent - INDENT + 2, lineStart + indent - INDENT + 2)
          } else {
            lines[lineIdx] = content.trim()
            const newValue = lines.join('\n')
            el.value = newValue
            onChange(newValue)
            el.setSelectionRange(lineStart, lineStart)
          }
          return
        }
      }
    }

    // Home: go to content start on bullet lines
    if (e.key === 'Home' && isBullet(line)) {
      e.preventDefault()
      el.setSelectionRange(minPos, el.selectionEnd < minPos ? minPos : el.selectionEnd)
      return
    }

    // ArrowLeft at content start: go to end of previous line
    if (e.key === 'ArrowLeft' && colInLine <= contentStart && isBullet(line)) {
      e.preventDefault()
      if (lineIdx > 0) {
        const prevEnd = lineStart - 1
        el.setSelectionRange(prevEnd, prevEnd)
      } else {
        el.setSelectionRange(minPos, minPos)
      }
      return
    }

    // Delete before content: move to content start
    if (e.key === 'Delete' && colInLine < contentStart && isBullet(line)) {
      e.preventDefault()
      el.setSelectionRange(minPos, minPos)
      return
    }

    setTimeout(clampCursor, 0)
  }

  const handleBeforeInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = ref.current
    if (!el) return
    const info = getLineAt(el.selectionStart)
    if (!info) return
    const { line, lineStart } = info
    const contentStart = getContentStart(line)
    const colInLine = el.selectionStart - lineStart
    if (colInLine < contentStart && isBullet(line)) {
      e.preventDefault()
      const data = (e.nativeEvent as InputEvent).data
      const insertAt = lineStart + contentStart
      if (data) {
        const v = el.value
        const next = v.slice(0, insertAt) + data + v.slice(el.selectionEnd)
        el.value = next
        onChange(next)
        el.setSelectionRange(insertAt + data.length, insertAt + data.length)
      } else {
        el.setSelectionRange(insertAt, insertAt)
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\n')) return
    e.preventDefault()
    const el = ref.current
    if (!el) return
    const info = getLineAt(el.selectionStart)
    if (!info) return
    const lines = el.value.split('\n')
    const { lineIdx, line, colInLine } = info
    const before = line.slice(0, colInLine)
    const after = line.slice(colInLine)
    const norm = (s: string) => {
      const sp = (s.match(/^\s*/)?.[0] ?? '').length
      const rest = s.slice(sp).replace(/^[•*\-]\s?/, '')
      return ' '.repeat(sp) + '- ' + rest
    }
    const pasted = text.split(/\r?\n/).map(norm)
    const out = [...lines.slice(0, lineIdx)]
    out.push(before + (pasted[0] ?? ''))
    for (let i = 1; i < pasted.length; i++) out.push(pasted[i] ?? '')
    if (pasted.length > 1) {
      out[out.length - 1] = (out[out.length - 1] ?? '') + after
    } else {
      out[lineIdx] = (out[lineIdx] ?? '') + after
    }
    const newValue = out.join('\n')
    el.value = newValue
    onChange(newValue)
    const newPos = Math.min(out.slice(0, lineIdx + pasted.length).join('\n').length, newValue.length)
    el.setSelectionRange(newPos, newPos)
  }

  const lines = (value ?? '').split('\n')
  const renderDisplay = () => {
    if (!value.trim()) return <span className="note-placeholder">{placeholder}</span>
    return lines.map((line, i) => (
      <span key={i}>
        {getDisplayLine(line).split('').map((char, j) =>
          BULLETS.includes(char) ? (
            <span key={j} className="note-bullet">
              <span className="note-bullet-width" aria-hidden>-</span>
              <span className="note-bullet-glyph">{char}</span>
            </span>
          ) : (
            char
          )
        )}
        {i < lines.length - 1 ? '\n' : null}
      </span>
    ))
  }

  return (
    <div className="note-editor-wrap">
      <textarea
        ref={ref}
        className="note-editor"
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onBlur?.(ref.current?.value ?? '')}
        onKeyDown={handleKeyDown}
        onBeforeInput={handleBeforeInput}
        onSelect={clampCursor}
        onMouseUp={clampCursor}
        onPaste={handlePaste}
        placeholder={placeholder}
        spellCheck={false}
      />
      <div className="note-editor-display" aria-hidden="true">
        {renderDisplay()}
      </div>
      <style>{`
        .note-editor-wrap { position: relative; width: 100%; }
        .note-editor {
          position: relative;
          z-index: 1;
          display: block;
          width: 100%;
          padding: 0.75rem 1rem;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: transparent;
          caret-color: var(--text);
          font-size: 0.95rem;
          line-height: 1.5;
          min-height: 7.5rem;
          overflow-y: hidden;
          font-family: var(--font);
        }
        .note-editor::placeholder { color: transparent; }
        .note-editor:focus {
          outline: none;
          border-color: var(--accent);
        }
        .note-editor-display {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 0;
          padding: 0.75rem 1rem;
          background: var(--bg);
          border-radius: var(--radius);
          color: var(--text);
          font-size: 0.95rem;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
          pointer-events: none;
          overflow: hidden;
          font-family: var(--font);
        }
        .note-placeholder { color: var(--text-muted); }
        .note-bullet { display: inline-block; position: relative; }
        .note-bullet-width { visibility: hidden; user-select: none; }
        .note-bullet-glyph { position: absolute; left: 0; top: 0; }
      `}</style>
    </div>
  )
}
