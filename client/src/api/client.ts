import type { GameState } from '@asura/shared'

// Vite exposes VITE_* env vars at build time (see client/.env.example).
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`)
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  token?: string | null
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, json)
  return json as T
}

export interface AuthResponse {
  token: string
  user: { id: string; username: string }
}

export interface CharacterResponse {
  character: GameState & { id: string }
}

/** Fields persisted via PUT — the GameState fields that are mutable in-game
 *  (identity fields name/raceId/classId are set at creation and immutable). */
export type SaveBody = Omit<GameState, 'name' | 'raceId' | 'classId'>

export const api = {
  register: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: { username, password } }),

  login: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: { username, password } }),

  getCharacter: (token: string) =>
    request<CharacterResponse>('/api/character', { token }),

  createCharacter: (token: string, body: { name: string; raceId: string; classId: string }) =>
    request<CharacterResponse>('/api/character', { method: 'POST', token, body }),

  saveCharacter: (token: string, body: SaveBody) =>
    request<CharacterResponse>('/api/character', { method: 'PUT', token, body }),
}
