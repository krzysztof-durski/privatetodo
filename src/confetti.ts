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
    spread: 55,
    startVelocity: 40,
    scalar: 0.95,
  } as const

  // Fire from left and right edges.
  confetti({
    ...base,
    particleCount: 55,
    angle: 60,
    origin: { x: 0, y: 0.75 },
  })
  confetti({
    ...base,
    particleCount: 55,
    angle: 120,
    origin: { x: 1, y: 0.75 },
  })

  // Add light corner bursts for a fuller edge effect.
  confetti({
    ...base,
    particleCount: 30,
    angle: 45,
    origin: { x: 0, y: 0.25 },
  })
  confetti({
    ...base,
    particleCount: 30,
    angle: 135,
    origin: { x: 1, y: 0.25 },
  })
}
