import { useEffect, useState } from 'react'
import { api, tokens, type User } from './api'
import { Auth } from './Auth'
import { Groups } from './Groups'
import { GroupDetail } from './GroupDetail'

export function App() {
  const [me, setMe] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  // Токен может лежать в localStorage с прошлого визита — проверяем,
  // жив ли он, одним запросом к /users/me
  const identify = async () => {
    if (!tokens.access) {
      setChecked(true)
      return
    }
    try {
      setMe(await api.me())
    } catch {
      tokens.clear()
    } finally {
      setChecked(true)
    }
  }

  useEffect(() => {
    void identify()
  }, [])

  if (!checked) return <div className="app" />

  if (!me) {
    return (
      <div className="app">
        <Auth
          onDone={() => {
            setChecked(false)
            void identify()
          }}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="top">
        <h1>Splitly</h1>
        <div className="row">
          <span className="who">{me.displayName}</span>
          <button
            className="link"
            onClick={() => {
              tokens.clear()
              setMe(null)
              setOpenGroup(null)
            }}
          >
            выйти
          </button>
        </div>
      </header>

      {openGroup ? (
        <GroupDetail groupId={openGroup} meId={me.id} onBack={() => setOpenGroup(null)} />
      ) : (
        <Groups onOpen={setOpenGroup} />
      )}
    </div>
  )
}
