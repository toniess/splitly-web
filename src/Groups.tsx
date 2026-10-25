import { useEffect, useState } from 'react'
import { api } from './client'
import { type GroupSummary } from './api'
import { ErrorBox, Field, useAction } from './ui'

export function Groups({ onOpen }: { onOpen: (id: string) => void }) {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [adding, setAdding] = useState<'none' | 'create' | 'join'>('none')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('UZS')
  const [code, setCode] = useState('')

  const load = useAction(async () => setGroups(await api.groups()))
  useEffect(() => {
    void load.run()
    // загружаем один раз при монтировании

  }, [])

  const create = useAction(async () => {
    const group = await api.createGroup(name, currency)
    setName('')
    setAdding('none')
    onOpen(group.id)
  })

  const join = useAction(async () => {
    await api.joinGroup(code.trim().toUpperCase())
    setCode('')
    setAdding('none')
    await load.run()
  })

  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>Группы</h2>
        <div className="row">
          <button className="ghost" onClick={() => setAdding(adding === 'join' ? 'none' : 'join')}>
            Войти по коду
          </button>
          <button onClick={() => setAdding(adding === 'create' ? 'none' : 'create')}>
            Новая группа
          </button>
        </div>
      </div>

      {adding === 'create' && (
        <form
          className="card"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault()
            void create.run()
          }}
        >
          <ErrorBox error={create.error} />
          <Field label="Название">
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </Field>
          <Field label="Валюта">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option>UZS</option>
              <option>USD</option>
              <option>EUR</option>
              <option>RUB</option>
            </select>
          </Field>
          <button disabled={create.busy}>Создать</button>
        </form>
      )}

      {adding === 'join' && (
        <form
          className="card"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault()
            void join.run()
          }}
        >
          <ErrorBox error={join.error} />
          <Field label="Код приглашения">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="XFVYNZ"
              style={{ textTransform: 'uppercase' }}
            />
          </Field>
          <button disabled={join.busy}>Вступить</button>
        </form>
      )}

      <div style={{ marginTop: 12 }}>
        <ErrorBox error={load.error} />
        {groups === null && <div className="empty">Загружаем…</div>}
        {groups?.length === 0 && (
          <div className="empty">
            Пока ни одной группы.
            <br />
            Создайте свою или вступите по коду.
          </div>
        )}
        <div className="list">
          {groups?.map((g) => (
            <div key={g.id} className="card click" onClick={() => onOpen(g.id)}>
              <div className="row between">
                <strong>{g.name}</strong>
                <span className="chip">{g.currency}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
