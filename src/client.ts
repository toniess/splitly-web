// Подмена клиента для демо-режима.
//
// Компоненты импортируют отсюда и не знают, с чем работают: настоящий API
// или песочница в памяти. Благодаря этому демо не требует ни одной ветки
// `if (demo)` в коде экранов.

import { api as real } from './api'
import { demoApi } from './demo'

let demo = false

export function setDemoMode(on: boolean) {
  demo = on
  if (on) demoApi.reset()
}

export function isDemoMode() {
  return demo
}

type Client = typeof real

export const api = new Proxy({} as Client, {
  get(_target, prop: string) {
    const source = demo ? (demoApi as Record<string, unknown>) : (real as Record<string, unknown>)
    return source[prop]
  },
})

// Хранилище токенов общее: в демо-режиме оно просто не используется.
export { tokens } from './api'
