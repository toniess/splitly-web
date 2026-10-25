// Клиент Splitly API. Типы повторяют record-ы бэкенда: если там что-то
// переименуют, расхождение вылезет здесь при сборке, а не в рантайме.

const BASE = import.meta.env.VITE_API_BASE ?? 'https://splitly.containerapps.ru'

// ---------- типы ответов ----------

export type TokenPair = {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
}

export type User = { id: string; email: string; displayName: string; createdAt: string }

export type GroupSummary = { id: string; name: string; currency: string }
export type Group = GroupSummary & { inviteCode: string; createdAt: string }
export type GroupMember = {
  userId: string
  displayName: string
  role: 'OWNER' | 'MEMBER'
  joinedAt: string
}

export type SplitType = 'EQUAL' | 'SHARES' | 'EXACT'

export type ExpenseSummary = {
  id: string
  description: string
  amount: string
  payerId: string
  spentAt: string
}
export type ExpenseFeedPage = { items: ExpenseSummary[]; nextCursor: string | null }
export type Share = { userId: string; displayName: string; amount: string }
export type Expense = {
  id: string
  groupId: string
  payerId: string
  amount: string
  currency: string
  description: string
  spentAt: string
  splitType: SplitType
  version: number
  createdAt: string
  shares: Share[]
}

export type Balance = { userId: string; displayName: string; balance: string }
export type Transfer = { from: string; to: string; amount: string }

/** Ошибка в формате RFC 7807, который отдаёт бэкенд. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string,
    readonly traceId?: string,
    readonly fields?: { field: string; message: string }[],
  ) {
    super(detail || title)
  }

  /** Текст для показа пользователю: детали полей важнее общей формулировки. */
  get humanMessage(): string {
    if (this.fields?.length) {
      return this.fields.map((f) => `${f.field}: ${f.message}`).join('; ')
    }
    return this.detail || this.title
  }
}

// ---------- хранение токенов ----------

const ACCESS_KEY = 'splitly.access'
const REFRESH_KEY = 'splitly.refresh'

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  save(pair: TokenPair) {
    localStorage.setItem(ACCESS_KEY, pair.accessToken)
    localStorage.setItem(REFRESH_KEY, pair.refreshToken)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

// ---------- транспорт ----------

type Options = {
  method?: string
  body?: unknown
  auth?: boolean
  /** Защита от повторной отправки: бэкенд требует этот заголовок на создание трат и переводов. */
  idempotent?: boolean
}

let refreshing: Promise<boolean> | null = null

/**
 * Обновляет пару токенов. Одновременные 401 не должны порождать несколько
 * обновлений: refresh-токен одноразовый, и второй запрос получил бы отказ,
 * а бэкенд счёл бы это попыткой повторного использования и отозвал всю сессию.
 */
async function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing

  refreshing = (async () => {
    const refresh = tokens.refresh
    if (!refresh) return false
    try {
      const response = await fetch(`${BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      })
      if (!response.ok) return false
      tokens.save(await response.json())
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()

  return refreshing
}

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.auth !== false && tokens.access) {
      headers['Authorization'] = `Bearer ${tokens.access}`
    }
    if (options.idempotent) headers['Idempotency-Key'] = crypto.randomUUID()

    return fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  }

  let response = await send()

  // Токен живёт 15 минут. Истёк — молча обновляем и повторяем один раз.
  if (response.status === 401 && options.auth !== false && tokens.refresh) {
    if (await refreshTokens()) {
      response = await send()
    }
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.title ?? 'Ошибка',
      payload?.detail ?? '',
      payload?.traceId,
      payload?.errors,
    )
  }
  return payload as T
}

// ---------- методы ----------

export const api = {
  register: (email: string, password: string, displayName: string) =>
    request<{ userId: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: { email, password, displayName },
      auth: false,
    }),

  login: (email: string, password: string) =>
    request<TokenPair>('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),

  me: () => request<User>('/api/v1/users/me'),

  groups: () => request<GroupSummary[]>('/api/v1/groups'),

  group: (id: string) => request<Group>(`/api/v1/groups/${id}`),

  createGroup: (name: string, currency: string) =>
    request<Group>('/api/v1/groups', { method: 'POST', body: { name, currency } }),

  joinGroup: (inviteCode: string) =>
    request<GroupMember>('/api/v1/groups/join', { method: 'POST', body: { inviteCode } }),

  members: (groupId: string) => request<GroupMember[]>(`/api/v1/groups/${groupId}/members`),

  leaveGroup: (groupId: string) =>
    request<void>(`/api/v1/groups/${groupId}/members/me`, { method: 'DELETE' }),

  feed: (groupId: string, cursor?: string | null, limit = 20) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    return request<ExpenseFeedPage>(`/api/v1/groups/${groupId}/expenses?${params}`)
  },

  expense: (id: string) => request<Expense>(`/api/v1/expenses/${id}`),

  createExpense: (
    groupId: string,
    body: {
      description: string
      amount: string
      payerId: string
      spentAt: string
      splitType: SplitType
      participants: { userId: string; value: string | null }[]
    },
  ) =>
    request<Expense>(`/api/v1/groups/${groupId}/expenses`, {
      method: 'POST',
      body,
      idempotent: true,
    }),

  deleteExpense: (id: string) => request<void>(`/api/v1/expenses/${id}`, { method: 'DELETE' }),

  balances: (groupId: string) =>
    request<{ items: Balance[] }>(`/api/v1/groups/${groupId}/balances`),

  plan: (groupId: string) =>
    request<{ items: Transfer[] }>(`/api/v1/groups/${groupId}/settlement-plan`),

  settle: (groupId: string, fromUserId: string, toUserId: string, amount: string) =>
    request(`/api/v1/groups/${groupId}/settlements`, {
      method: 'POST',
      body: { fromUserId, toUserId, amount },
      idempotent: true,
    }),
}
