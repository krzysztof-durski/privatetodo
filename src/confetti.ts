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
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
  })
}
