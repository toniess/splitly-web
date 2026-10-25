import { useCallback, useEffect, useState } from 'react'
import { api } from './client'
import { type Balance, type ExpenseSummary, type Group, type GroupMember, type SplitType, type Transfer } from './api'
import { ErrorBox, Field, Money, formatDate, useAction } from './ui'

type Tab = 'expenses' | 'balances' | 'settle'

export function GroupDetail({
  groupId,
  meId,
  onBack,
}: {
  groupId: string
  meId: string
  onBack: () => void
}) {
  const [tab, setTab] = useState<Tab>('expenses')
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])

  const load = useAction(async () => {
    const [g, m] = await Promise.all([api.group(groupId), api.members(groupId)])
    setGroup(g)
    setMembers(m)
  })

  useEffect(() => {
    void load.run()

  }, [groupId])

  const nameOf = useCallback(
    (userId: string) => members.find((m) => m.userId === userId)?.displayName ?? '—',
    [members],
  )

  if (!group) {
    return (
      <>
        <button className="link" onClick={onBack}>
          ← к группам
        </button>
        <ErrorBox error={load.error} />
        {!load.error && <div className="empty">Загружаем…</div>}
      </>
    )
  }

  return (
    <>
      <button className="link" onClick={onBack}>
        ← к группам
      </button>

      <div className="row between" style={{ marginTop: 10 }}>
        <h2 style={{ margin: 0 }}>{group.name}</h2>
        <span className="chip" title="Код приглашения — им зовут в группу">
          {group.inviteCode}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {members.length} участник(ов) · {group.currency}
      </p>

      <div className="tabs">
        <button className={tab === 'expenses' ? 'on' : ''} onClick={() => setTab('expenses')}>
          Траты
        </button>
        <button className={tab === 'balances' ? 'on' : ''} onClick={() => setTab('balances')}>
          Балансы
        </button>
        <button className={tab === 'settle' ? 'on' : ''} onClick={() => setTab('settle')}>
          Расчёт
        </button>
      </div>

      {tab === 'expenses' && (
        <Expenses groupId={groupId} meId={meId} members={members} nameOf={nameOf} />
      )}
      {tab === 'balances' && <Balances groupId={groupId} meId={meId} />}
      {tab === 'settle' && <Settle groupId={groupId} meId={meId} nameOf={nameOf} />}
    </>
  )
}

// ---------- траты ----------

function Expenses({
  groupId,
  meId,
  members,
  nameOf,
}: {
  groupId: string
  meId: string
  members: GroupMember[]
  nameOf: (id: string) => string
}) {
  const [items, setItems] = useState<ExpenseSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useAction(async (reset: boolean) => {
    const page = await api.feed(groupId, reset ? null : cursor)
    setItems(reset ? page.items : [...items, ...page.items])
    setCursor(page.nextCursor)
  })

  useEffect(() => {
    void load.run(true)

  }, [groupId])

  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Что потратили</h3>
        <button onClick={() => setAdding(!adding)}>{adding ? 'Отмена' : 'Добавить трату'}</button>
      </div>

      {adding && (
        <ExpenseForm
          groupId={groupId}
          meId={meId}
          members={members}
          onDone={() => {
            setAdding(false)
            void load.run(true)
          }}
        />
      )}

      <ErrorBox error={load.error} />
      {items.length === 0 && !load.busy && <div className="empty">Трат пока нет</div>}

      <div className="list">
        {items.map((e) => (
          <div key={e.id} className="card">
            <div className="row between">
              <div>
                <strong>{e.description}</strong>
                <div className="muted">
                  {nameOf(e.payerId)} · {formatDate(e.spentAt)}
                </div>
              </div>
              <Money value={e.amount} />
            </div>
          </div>
        ))}
      </div>

      {cursor && (
        <button className="ghost" disabled={load.busy} onClick={() => void load.run(false)}>
          Показать ещё
        </button>
      )}
    </>
  )
}

function ExpenseForm({
  groupId,
  meId,
  members,
  onDone,
}: {
  groupId: string
  meId: string
  members: GroupMember[]
  onDone: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [payerId, setPayerId] = useState(meId)
  const [date, setDate] = useState(today)
  const [splitType, setSplitType] = useState<SplitType>('EQUAL')
  const [chosen, setChosen] = useState<Set<string>>(new Set(members.map((m) => m.userId)))
  const [values, setValues] = useState<Record<string, string>>({})

  const toggle = (userId: string) => {
    const next = new Set(chosen)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    setChosen(next)
  }

  const { run, busy, error } = useAction(async () => {
    const participants = members
      .filter((m) => chosen.has(m.userId))
      .map((m) => ({
        userId: m.userId,
        // при равном делении сервер считает доли сам
        value: splitType === 'EQUAL' ? null : (values[m.userId] ?? '').trim() || '0',
      }))

    await api.createExpense(groupId, {
      description,
      amount,
      payerId,
      // Полночь выбранного дня по UTC может оказаться в будущем, а сервер
      // такие траты отклоняет. Для сегодняшней даты шлём текущий момент.
      spentAt: date === today ? new Date().toISOString() : new Date(date).toISOString(),
      splitType,
      participants,
    })
    onDone()
  })

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault()
        void run()
      }}
    >
      <ErrorBox error={error} />

      <Field label="На что">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          maxLength={100}
          placeholder="Такси до аэропорта"
        />
      </Field>

      <div className="row" style={{ gap: 12 }}>
        <div className="grow">
          <Field label="Сколько">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              inputMode="decimal"
              placeholder="300.00"
            />
          </Field>
        </div>
        <div className="grow">
          <Field label="Когда">
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </div>

      <Field label="Кто платил">
        <select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
              {m.userId === meId ? ' (вы)' : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Как делим">
        <select value={splitType} onChange={(e) => setSplitType(e.target.value as SplitType)}>
          <option value="EQUAL">Поровну</option>
          <option value="SHARES">По долям</option>
          <option value="EXACT">Точными суммами</option>
        </select>
      </Field>

      <h3 style={{ marginTop: 12 }}>
        Между кем
        {splitType === 'SHARES' && ' · доли'}
        {splitType === 'EXACT' && ' · суммы'}
      </h3>
      <div className="participants">
        {members.map((m) => (
          <div key={m.userId} className="participant">
            <input
              type="checkbox"
              checked={chosen.has(m.userId)}
              onChange={() => toggle(m.userId)}
            />
            <span className="grow">{m.displayName}</span>
            {splitType !== 'EQUAL' && chosen.has(m.userId) && (
              <input
                type="text"
                inputMode="decimal"
                value={values[m.userId] ?? ''}
                onChange={(e) => setValues({ ...values, [m.userId]: e.target.value })}
                placeholder={splitType === 'SHARES' ? '1' : '0.00'}
              />
            )}
          </div>
        ))}
      </div>

      <button style={{ marginTop: 12 }} disabled={busy || chosen.size === 0}>
        {busy ? '…' : 'Сохранить'}
      </button>
    </form>
  )
}

// ---------- балансы ----------

function Balances({ groupId, meId }: { groupId: string; meId: string }) {
  const [items, setItems] = useState<Balance[]>([])
  const load = useAction(async () => setItems((await api.balances(groupId)).items))

  useEffect(() => {
    void load.run()

  }, [groupId])

  return (
    <>
      <h3>Кто сколько должен</h3>
      <p className="muted" style={{ marginTop: -4 }}>
        Плюс — должны вам, минус — должны вы. Сумма всегда равна нулю.
      </p>
      <ErrorBox error={load.error} />
      <div className="list">
        {items.map((b) => (
          <div key={b.userId} className="card">
            <div className="row between">
              <span>
                {b.displayName}
                {b.userId === meId && <span className="muted"> (вы)</span>}
              </span>
              <Money value={b.balance} signed />
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && !load.busy && <div className="empty">Пока нечего считать</div>}
    </>
  )
}

// ---------- расчёт ----------

function Settle({
  groupId,
  meId,
  nameOf,
}: {
  groupId: string
  meId: string
  nameOf: (id: string) => string
}) {
  const [items, setItems] = useState<Transfer[]>([])
  const load = useAction(async () => setItems((await api.plan(groupId)).items))

  useEffect(() => {
    void load.run()

  }, [groupId])

  const settle = useAction(async (t: Transfer) => {
    await api.settle(groupId, t.from, t.to, t.amount)
    await load.run()
  })

  return (
    <>
      <h3>Как закрыть долги</h3>
      <p className="muted" style={{ marginTop: -4 }}>
        Минимальный набор переводов. Отметить перевод может только тот, кто отдаёт деньги.
      </p>

      <ErrorBox error={load.error} />
      <ErrorBox error={settle.error} />

      {items.length === 0 && !load.busy && <div className="empty">Все в расчёте 🎉</div>}

      <div className="list">
        {items.map((t, i) => (
          <div key={i} className="card">
            <div className="row between wrap" style={{ gap: 10 }}>
              <span>
                <strong>{t.from === meId ? 'Вы' : nameOf(t.from)}</strong> →{' '}
                <strong>{t.to === meId ? 'вам' : nameOf(t.to)}</strong>
              </span>
              <div className="row">
                <Money value={t.amount} />
                {t.from === meId && (
                  <button disabled={settle.busy} onClick={() => void settle.run(t)}>
                    Я отдал
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
