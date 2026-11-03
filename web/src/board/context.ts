import { createContext, useContext } from 'react'
import type { BoardEngine } from '../canvas/engine'
import type { BoardSession } from '../collab/session'

export interface BoardContextValue {
  engine: BoardEngine
  session: BoardSession
  kind: 'r' | 'v'
  id: string
}

export const BoardContext = createContext<BoardContextValue | null>(null)

export const useBoard = (): BoardContextValue => {
  const value = useContext(BoardContext)
  if (!value) throw new Error('useBoard must be used inside a board')
  return value
}
