import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api, tokens } from './api'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const body = {
  description: 'Такси',
  amount: '100.00',
  payerId: 'a',
  spentAt: '2026-10-01T00:00:00Z',
  splitType: 'EQUAL' as const,
  participants: [{ userId: 'a', value: null }],
}

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  tokens.save({ accessToken: 'old', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 })
})

afterEach(() => vi.unstubAllGlobals())

const keysSentTo = (fetch: ReturnType<typeof vi.fn>, path: string) =>
  fetch.mock.calls
    .filter(([url]) => String(url).endsWith(path))
    .map(([, init]) => (init as RequestInit).headers as Record<string, string>)
    .map((h) => h['Idempotency-Key'])

it('трата уходит с ключом вызывающего, и повтор после 401 — с тем же ключом', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json(401, { title: 'Unauthorized' }))
    .mockResolvedValueOnce(json(200, { accessToken: 'new', refreshToken: 'r2', tokenType: 'Bearer', expiresIn: 900 }))
    .mockResolvedValueOnce(json(201, { id: 'e1' }))
  vi.stubGlobal('fetch', fetch)

  await api.createExpense('g', body, 'key-1')

  expect(keysSentTo(fetch, '/api/v1/groups/g/expenses')).toEqual(['key-1', 'key-1'])
})

it('повторная отправка той же траты после обрыва идёт с тем же ключом', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(json(201, { id: 'e1' }))
  vi.stubGlobal('fetch', fetch)

  await expect(api.createExpense('g', body, 'key-1')).rejects.toThrow()
  await api.createExpense('g', body, 'key-1')

  expect(keysSentTo(fetch, '/api/v1/groups/g/expenses')).toEqual(['key-1', 'key-1'])
})

it('перевод уходит с ключом вызывающего', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)

  await api.settle('g', 'a', 'b', '10.00', 'key-2')

  expect(keysSentTo(fetch, '/api/v1/groups/g/settlements')).toEqual(['key-2'])
})

it('чтение не шлёт ключ идемпотентности', async () => {
  const fetch = vi.fn().mockResolvedValue(json(200, []))
  vi.stubGlobal('fetch', fetch)

  await api.groups()

  expect(keysSentTo(fetch, '/api/v1/groups')).toEqual([undefined])
})
