import type { Translate } from '../i18n'
import { USER_COLORS } from '../lib/colors'
import { createId } from '../lib/ids'
import type { UserInfo } from '../lib/types'
import { readJson, writeJson } from '../lib/storage'

const KEY = 'pano:user'

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]

/** Persistent local identity (random friendly name + colour). `?name=` overrides the name. */
export const loadUser = (t: Translate): UserInfo => {
  let user = readJson<UserInfo | null>(KEY, null)
  if (!user || typeof user.name !== 'string' || typeof user.color !== 'string') {
    const name = `${pick(t('user.adjectives').split(','))} ${pick(t('user.animals').split(','))}`
    user = { id: createId(10), name, color: pick(USER_COLORS) }
    writeJson(KEY, user)
  }
  const params = new URLSearchParams(window.location.search)
  const override = params.get('name')?.trim().slice(0, 32)
  const color = params.get('color')
  return {
    ...user,
    ...(override ? { name: override } : {}),
    ...(color && /^#[0-9a-f]{6}$/i.test(color) ? { color } : {}),
  }
}

export const saveUserName = (name: string) => {
  const user = readJson<UserInfo | null>(KEY, null)
  if (user) writeJson(KEY, { ...user, name: name.trim().slice(0, 32) || user.name })
}
