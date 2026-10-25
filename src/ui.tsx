import { useState, type ReactNode } from 'react'
import { ApiError } from './api'

/** Показ ошибки API с traceId — по нему ошибку находят в логах сервера. */
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  if (error instanceof ApiError) {
    return (
      <div className="error">
        {error.humanMessage}
        {error.traceId && <span className="trace">traceId: {error.traceId}</span>}
      </div>
    )
  }
  return <div className="error">{error instanceof Error ? error.message : String(error)}</div>
}

/**
 * Обёртка над действием: сама держит состояние загрузки и ошибку,
 * чтобы каждая форма не заводила по три useState.
 */
export function useAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>,
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const run = async (...args: Args) => {
    setBusy(true)
    setError(null)
    try {
      await action(...args)
      return true
    } catch (e) {
      setError(e)
      return false
    } finally {
      setBusy(false)
    }
  }

  return { run, busy, error, setError }
}

export function Money({ value, signed = false }: { value: string; signed?: boolean }) {
  const amount = Number(value)
  const cls = !signed ? 'mono' : amount > 0 ? 'mono pos' : amount < 0 ? 'mono neg' : 'mono muted'
  const prefix = signed && amount > 0 ? '+' : ''
  return (
    <span className={cls}>
      {prefix}
      {value}
    </span>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  )
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
