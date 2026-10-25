// Демо-режим: тот же интерфейс, что у настоящего клиента, но всё живёт
// в памяти вкладки. Перезагрузил страницу — начал заново.
//
// Почему не демо-аккаунт на сервере: Neon на бесплатном тарифе засыпает,
// и первый запрос ждал бы пробуждения базы около десяти секунд — для кнопки
// «посмотреть» это выглядит как сломанный сайт. Плюс не нужно держать
// пароль демо-пользователя в публичном репозитории.
//
// Расчёты здесь повторяют серверные: деление в копейках, остаток по одной
// копейке участникам в порядке userId, жадный план переводов. Это осознанное
// дублирование ради автономности демо — настоящие деньги считает сервер.

import type {
  Balance,
  Expense,
  ExpenseFeedPage,
  Group,
  GroupMember,
  GroupSummary,
  SplitType,
  Transfer,
  User,
} from './api'

const ME = '00000000-0000-0000-0000-00000000000a'
const MARIA = '00000000-0000-0000-0000-00000000000b'
const IGOR = '00000000-0000-0000-0000-00000000000c'
const GROUP = '00000000-0000-0000-0000-0000000000f1'

const me: User = {
  id: ME,
  email: 'demo@splitly.dev',
  displayName: 'Вы',
  createdAt: '2026-10-01T10:00:00Z',
}

const members: GroupMember[] = [
  { userId: ME, displayName: 'Вы', role: 'OWNER', joinedAt: '2026-10-01T10:00:00Z' },
  { userId: MARIA, displayName: 'Мария', role: 'MEMBER', joinedAt: '2026-10-01T10:05:00Z' },
  { userId: IGOR, displayName: 'Игорь', role: 'MEMBER', joinedAt: '2026-10-01T10:06:00Z' },
]

const group: Group = {
  id: GROUP,
  name: 'Поездка в Самарканд',
  currency: 'UZS',
  inviteCode: 'DEMO42',
  createdAt: '2026-10-01T10:00:00Z',
}

// ---------- деньги ----------

const toCents = (value: string): number => Math.round(Number(value) * 100)
const fromCents = (cents: number): string => (cents / 100).toFixed(2)

/** Делит сумму поровну, раздавая остаток по копейке в порядке userId. */
function splitEqual(amountCents: number, userIds: string[]): Map<string, number> {
  const ordered = [...userIds].sort()
  const base = Math.floor(amountCents / ordered.length)
  const remainder = amountCents % ordered.length

  const result = new Map<string, number>()
  ordered.forEach((userId, i) => result.set(userId, base + (i < remainder ? 1 : 0)))
  return result
}

function splitByValues(
  amountCents: number,
  participants: { userId: string; value: string | null }[],
  splitType: SplitType,
): Map<string, number> {
  if (splitType === 'EXACT') {
    return new Map(participants.map((p) => [p.userId, toCents(p.value ?? '0')]))
  }

  // SHARES: делим пропорционально весам, остаток — тем же правилом
  const weights = participants.map((p) => Math.max(Number(p.value ?? '1') || 0, 0))
  const total = weights.reduce((a, b) => a + b, 0) || participants.length

  const result = new Map<string, number>()
  let given = 0
  participants.forEach((p, i) => {
    const share = Math.floor((amountCents * (weights[i] || 1)) / total)
    result.set(p.userId, share)
    given += share
  })

  // остаток раздаём по копейке в порядке userId
  const ordered = [...participants].map((p) => p.userId).sort()
  let left = amountCents - given
  for (let i = 0; left > 0; i = (i + 1) % ordered.length, left--) {
    result.set(ordered[i], (result.get(ordered[i]) ?? 0) + 1)
  }
  return result
}

// ---------- состояние ----------

type StoredExpense = Expense & { sharesCents: Map<string, number>; amountCents: number }

let expenses: StoredExpense[] = []
let settlements: { from: string; to: string; cents: number }[] = []

function addExpense(
  description: string,
  amount: string,
  payerId: string,
  spentAt: string,
  splitType: SplitType,
  participants: { userId: string; value: string | null }[],
): StoredExpense {
  const amountCents = toCents(amount)
  const sharesCents =
    splitType === 'EQUAL'
      ? splitEqual(
          amountCents,
          participants.map((p) => p.userId),
        )
      : splitByValues(amountCents, participants, splitType)

  const nameOf = (id: string) => members.find((m) => m.userId === id)?.displayName ?? '—'

  const expense: StoredExpense = {
    id: crypto.randomUUID(),
    groupId: GROUP,
    payerId,
    amount: fromCents(amountCents),
    currency: group.currency,
    description,
    spentAt,
    splitType,
    version: 0,
    createdAt: new Date().toISOString(),
    amountCents,
    sharesCents,
    shares: [...sharesCents.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([userId, cents]) => ({ userId, displayName: nameOf(userId), amount: fromCents(cents) })),
  }

  expenses = [expense, ...expenses]
  return expense
}

/** Заполняет песочницу так, чтобы сразу было что посмотреть. */
function seed() {
  expenses = []
  settlements = []
  addExpense('Отель, две ночи', '1200.00', ME, '2026-10-02T12:00:00Z', 'EQUAL', [
    { userId: ME, value: null },
    { userId: MARIA, value: null },
    { userId: IGOR, value: null },
  ])
  addExpense('Ужин в чайхане', '450.00', MARIA, '2026-10-03T19:30:00Z', 'EQUAL', [
    { userId: ME, value: null },
    { userId: MARIA, value: null },
    { userId: IGOR, value: null },
  ])
  // сумма не делится нацело: 300.33 на троих даёт 100.11 ровно,
  // а вот 100.00 на троих показывает раздачу остатка
  addExpense('Такси до Регистана', '100.00', ME, '2026-10-03T09:00:00Z', 'EQUAL', [
    { userId: ME, value: null },
    { userId: IGOR, value: null },
  ])
}

seed()

// ---------- производные величины ----------

function balanceCents(): Map<string, number> {
  const result = new Map(members.map((m) => [m.userId, 0]))
  const add = (userId: string, cents: number) =>
    result.set(userId, (result.get(userId) ?? 0) + cents)

  for (const e of expenses) {
    add(e.payerId, e.amountCents)
    for (const [userId, cents] of e.sharesCents) add(userId, -cents)
  }
  for (const s of settlements) {
    add(s.from, s.cents)
    add(s.to, -s.cents)
  }
  return result
}

/** Жадный план: крупнейший должник гасит крупнейшему кредитору. */
function plan(): Transfer[] {
  const balances = balanceCents()
  const debtors = [...balances.entries()].filter(([, c]) => c < 0).map(([id, c]) => [id, -c] as const)
  const creditors = [...balances.entries()].filter(([, c]) => c > 0).map(([id, c]) => [id, c] as const)

  debtors.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  creditors.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  const transfers: Transfer[] = []
  let i = 0
  let j = 0
  const left = debtors.map(([, c]) => c)
  const need = creditors.map(([, c]) => c)

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(left[i], need[j])
    if (amount > 0) {
      transfers.push({ from: debtors[i][0], to: creditors[j][0], amount: fromCents(amount) })
      left[i] -= amount
      need[j] -= amount
    }
    if (left[i] === 0) i++
    if (need[j] === 0) j++
  }
  return transfers
}

// ---------- тот же интерфейс, что у настоящего клиента ----------

const wait = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), 120))

export const demoApi = {
  register: () => wait({ userId: ME }),
  login: () => wait({ accessToken: 'demo', refreshToken: 'demo', tokenType: 'Bearer', expiresIn: 900 }),
  me: () => wait(me),

  groups: () => wait<GroupSummary[]>([{ id: group.id, name: group.name, currency: group.currency }]),
  group: () => wait(group),
  createGroup: (name: string, currency: string) => wait({ ...group, name, currency }),
  joinGroup: () => wait(members[0]),
  members: () => wait(members),
  leaveGroup: () => wait(undefined),

  feed: (): Promise<ExpenseFeedPage> =>
    wait({
      items: expenses.map((e) => ({
        id: e.id,
        description: e.description,
        amount: e.amount,
        payerId: e.payerId,
        spentAt: e.spentAt,
      })),
      nextCursor: null,
    }),

  expense: (id: string) => wait(expenses.find((e) => e.id === id)!),

  createExpense: (
    _groupId: string,
    body: {
      description: string
      amount: string
      payerId: string
      spentAt: string
      splitType: SplitType
      participants: { userId: string; value: string | null }[]
    },
  ) =>
    wait(
      addExpense(
        body.description,
        body.amount,
        body.payerId,
        body.spentAt,
        body.splitType,
        body.participants,
      ),
    ),

  deleteExpense: (id: string) => {
    expenses = expenses.filter((e) => e.id !== id)
    return wait(undefined)
  },

  balances: (): Promise<{ items: Balance[] }> =>
    wait({
      items: members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        balance: fromCents(balanceCents().get(m.userId) ?? 0),
      })),
    }),

  plan: () => wait({ items: plan() }),

  settle: (_groupId: string, fromUserId: string, toUserId: string, amount: string) => {
    settlements.push({ from: fromUserId, to: toUserId, cents: toCents(amount) })
    return wait(undefined)
  },

  /** Вернуть песочницу в исходное состояние. */
  reset: seed,
}
