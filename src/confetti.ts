import confetti from 'canvas-confetti'

const STORAGE_KEY = 'privatetodo-confetti-enabled'

export function isConfettiEnabled(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === null) return true // default: enabled
  return stored === 'true'
}

export function setConfettiEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled))
}

export function fireConfetti(): void {
  if (!isConfettiEnabled()) return
  const base = {
    spread: 50,
    startVelocity: 42,
    scalar: 0.95,
  } as const

  const cannons = [
    { angle: 58, x: 0, y: 0.82, count: 42 },
    { angle: 62, x: 0, y: 0.6, count: 38 },
    { angle: 66, x: 0, y: 0.38, count: 34 },
    { angle: 120, x: 1, y: 0.82, count: 42 },
    { angle: 116, x: 1, y: 0.6, count: 38 },
    { angle: 112, x: 1, y: 0.38, count: 34 },
    { angle: 45, x: 0, y: 0.22, count: 26 },
    { angle: 135, x: 1, y: 0.22, count: 26 },
  ] as const

  cannons.forEach((cannon) => {
    confetti({
      ...base,
      particleCount: cannon.count,
      angle: cannon.angle,
      origin: { x: cannon.x, y: cannon.y },
    })
  })
}
