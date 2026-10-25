import { useState } from 'react'
import { api, tokens } from './client'
import { setDemoMode } from './client'
import { ErrorBox, Field, useAction } from './ui'

export function Auth({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  const { run, busy, error } = useAction(async () => {
    // После регистрации сразу логинимся: бэкенд на регистрацию возвращает
    // только userId, токенов не выдаёт
    if (mode === 'register') {
      await api.register(email, password, displayName)
    }
    tokens.save(await api.login(email, password))
    onDone()
  })

  return (
    <div className="center">
      <form
        className="auth"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Splitly</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
          Делим счёт и считаем, кто кому должен
        </p>

        <ErrorBox error={error} />

        {mode === 'register' && (
          <Field label="Как вас зовут">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={100}
            />
          </Field>
        )}

        <Field label="Почта">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>

        <Field label="Пароль">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>

        <button type="submit" disabled={busy} style={{ width: '100%', marginTop: 8 }}>
          {busy ? '…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </button>

        <div className="divider"><span>или</span></div>

        <button
          type="button"
          className="ghost"
          style={{ width: '100%' }}
          onClick={() => {
            setDemoMode(true)
            onDone()
          }}
        >
          Посмотреть демо без регистрации
        </button>

        <p className="muted" style={{ textAlign: 'center', marginBottom: 0 }}>
          {mode === 'login' ? 'Ещё нет аккаунта? ' : 'Уже есть аккаунт? '}
          <button
            type="button"
            className="link"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Создать' : 'Войти'}
          </button>
        </p>
      </form>
    </div>
  )
}
