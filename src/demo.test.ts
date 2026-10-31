import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError, type SplitType } from './api'
import { demoApi } from './demo'

// Песочница повторяет серверные расчёты, поэтому проверяем её на те же
// инварианты, что и бэкенд.

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'

const expense = (
  amount: string,
  splitType: SplitType,
  participants: readonly (readonly [string, string | null])[],
) => ({
  description: 'тест',
  amount,
  payerId: A,
  spentAt: '2026-10-01T00:00:00Z',
  splitType,
  participants: participants.map(([userId, value]) => ({ userId, value })),
})

const shares = async (body: ReturnType<typeof expense>) =>
  (await demoApi.createExpense('g', body, crypto.randomUUID())).shares.map((s) => s.amount)

const cents = (v: string) => Math.round(Number(v) * 100)

beforeEach(() => demoApi.reset())

describe('деление', () => {
  it('100.00 на троих поровну: 33.34 + 33.33 + 33.33', async () => {
    expect(await shares(expense('100.00', 'EQUAL', [[A, null], [B, null], [C, null]]))).toEqual([
      '33.34',
      '33.33',
      '33.33',
    ])
  })

  it('SHARES 1:2 делит пропорционально и не теряет копейки', async () => {
    const result = await shares(expense('100.00', 'SHARES', [[A, '1'], [B, '2']]))
    expect(result.map(cents).reduce((a, b) => a + b)).toBe(10000)
  })

  it('SHARES: участник с весом 0 ничего не платит', async () => {
    expect(await shares(expense('100.00', 'SHARES', [[A, '0'], [B, '1'], [C, '1']]))).toEqual([
      '0.00',
      '50.00',
      '50.00',
    ])
  })

  it('SHARES 0:1:2 — копейка остатка первому платящему, а не участнику с весом 0', async () => {
    expect(await shares(expense('100.00', 'SHARES', [[A, '0'], [B, '1'], [C, '2']]))).toEqual([
      '0.00',
      '33.34',
      '66.66',
    ])
  })

  it('SHARES с огромными весами считается точно', async () => {
    const result = await shares(
      expense('999999999.99', 'SHARES', [[A, '999999999999999'], [B, '1']]),
    )
    expect(result.map(cents).reduce((a, b) => a + b)).toBe(99999999999)
  })

  it.each([
    ['все веса нулевые', [[A, '0'], [B, '0']]],
    ['дробный вес', [[A, '1.5'], [B, '1']]],
    ['отрицательный вес', [[A, '-1'], [B, '2']]],
  ] as const)('SHARES: %s — отказ 422, как на сервере', async (_, participants) => {
    await expect(
      demoApi.createExpense('g', expense('100.00', 'SHARES', participants), 'k'),
    ).rejects.toSatisfy((e) => e instanceof ApiError && e.status === 422)
  })

  it('EXACT с суммой долей не равной сумме траты — отказ 422', async () => {
    await expect(
      demoApi.createExpense('g', expense('100.00', 'EXACT', [[A, '50.00'], [B, '40.00']]), 'k'),
    ).rejects.toSatisfy((e) => e instanceof ApiError && e.status === 422)
  })
})

describe('идемпотентность', () => {
  it('повторный ключ не создаёт вторую трату', async () => {
    const before = (await demoApi.feed()).items.length
    const body = expense('10.00', 'EQUAL', [[A, null]])
    const first = await demoApi.createExpense('g', body, 'same')
    const second = await demoApi.createExpense('g', body, 'same')
    expect(second.id).toBe(first.id)
    expect((await demoApi.feed()).items.length).toBe(before + 1)
  })

  it('повторный ключ не записывает перевод дважды', async () => {
    const [t] = (await demoApi.plan()).items
    await demoApi.settle('g', t.from, t.to, t.amount, 'same')
    const after = (await demoApi.balances()).items
    await demoApi.settle('g', t.from, t.to, t.amount, 'same')
    expect((await demoApi.balances()).items).toEqual(after)
  })

  it('план обнуляет все сальдо', async () => {
    let i = 0
    for (const t of (await demoApi.plan()).items) {
      await demoApi.settle('g', t.from, t.to, t.amount, `settle-${i++}`)
    }
    expect((await demoApi.balances()).items.every((b) => cents(b.balance) === 0)).toBe(true)
    expect((await demoApi.plan()).items).toEqual([])
  })
})
