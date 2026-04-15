import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

type AlertRequest = {
  kind: 'alert'
  message: string
  title?: string
  buttonText?: string
}

type ConfirmRequest = {
  kind: 'confirm'
  message: string
  title?: string
  confirmText?: string
  cancelText?: string
}

type PromptRequest = {
  kind: 'prompt'
  message: string
  title?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
}

type DialogRequest = AlertRequest | ConfirmRequest | PromptRequest

type DialogApi = {
  showAlert: (message: string, options?: Omit<AlertRequest, 'kind' | 'message'>) => Promise<void>
  showConfirm: (message: string, options?: Omit<ConfirmRequest, 'kind' | 'message'>) => Promise<boolean>
  showPrompt: (message: string, options?: Omit<PromptRequest, 'kind' | 'message'>) => Promise<string | null>
}

const DialogContext = createContext<DialogApi | null>(null)

export function useAppDialogs(): DialogApi {
  const value = useContext(DialogContext)
  if (!value) throw new Error('useAppDialogs must be used within AppDialogsProvider')
  return value
}

export function AppDialogsProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<DialogRequest | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const resolverRef = useRef<((value: unknown) => void) | null>(null)

  const showAlert = useCallback((message: string, options: Omit<AlertRequest, 'kind' | 'message'> = {}) => {
    return new Promise<void>((resolve) => {
      resolverRef.current = resolve as (value: unknown) => void
      setCurrent({ kind: 'alert', message, ...options })
    })
  }, [])

  const showConfirm = useCallback((message: string, options: Omit<ConfirmRequest, 'kind' | 'message'> = {}) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve as (value: unknown) => void
      setCurrent({ kind: 'confirm', message, ...options })
    })
  }, [])

  const showPrompt = useCallback((message: string, options: Omit<PromptRequest, 'kind' | 'message'> = {}) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve as (value: unknown) => void
      setPromptValue(options.defaultValue ?? '')
      setCurrent({ kind: 'prompt', message, ...options })
    })
  }, [])

  const closeWith = useCallback((value: unknown) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setCurrent(null)
    if (resolve) resolve(value)
  }, [])

  const api = useMemo<DialogApi>(() => ({ showAlert, showConfirm, showPrompt }), [showAlert, showConfirm, showPrompt])

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && (
        <div className="app-dialog-backdrop" onClick={() => {
          if (current.kind === 'alert') closeWith(undefined)
          else if (current.kind === 'confirm') closeWith(false)
          else closeWith(null)
        }}>
          <div className="app-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{current.title ?? (current.kind === 'alert' ? 'Notice' : current.kind === 'confirm' ? 'Please confirm' : 'Enter value')}</h3>
            <p>{current.message}</p>
            {current.kind === 'prompt' && (
              <input
                autoFocus
                value={promptValue}
                placeholder={current.placeholder}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') closeWith(promptValue)
                  if (e.key === 'Escape') closeWith(null)
                }}
              />
            )}
            <div className="app-dialog-actions">
              {current.kind !== 'alert' && (
                <button className="app-dialog-cancel" onClick={() => closeWith(current.kind === 'confirm' ? false : null)}>
                  {current.cancelText ?? 'Cancel'}
                </button>
              )}
              <button
                className="app-dialog-confirm"
                onClick={() => closeWith(current.kind === 'alert' ? undefined : current.kind === 'confirm' ? true : promptValue)}
              >
                {current.kind === 'alert' ? (current.buttonText ?? 'OK') : (current.confirmText ?? 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .app-dialog-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: grid;
          place-items: center;
          z-index: 100;
          padding: 1rem;
        }
        .app-dialog {
          width: min(460px, 100%);
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.45);
        }
        .app-dialog h3 {
          margin: 0 0 0.5rem;
          font-size: 1.05rem;
        }
        .app-dialog p {
          margin: 0;
          color: var(--text-muted);
          white-space: pre-wrap;
          line-height: 1.5;
        }
        .app-dialog input {
          width: 100%;
          margin-top: 0.9rem;
          padding: 0.6rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--bg);
          color: var(--text);
        }
        .app-dialog input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .app-dialog-actions {
          margin-top: 1rem;
          display: flex;
          justify-content: flex-end;
          gap: 0.6rem;
        }
        .app-dialog-cancel {
          border: 1px solid var(--border);
          color: var(--text-muted);
          border-radius: var(--radius);
          padding: 0.5rem 0.8rem;
          background: transparent;
        }
        .app-dialog-confirm {
          border-radius: var(--radius);
          padding: 0.5rem 0.8rem;
          background: var(--accent);
          color: #fff;
        }
      `}</style>
    </DialogContext.Provider>
  )
}
