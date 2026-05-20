import { useState } from 'react'
import { useGame } from '../game/store'
import { ApiError } from '../api/client'

// Minimal functional auth UI. Polish/restyle freely — the only contract is that
// it calls `useGame.register(username, password)` or `useGame.login(...)`.
export function AuthScreen() {
  const register = useGame((s) => s.register)
  const login = useGame((s) => s.login)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'register') await register(username, password)
      else await login(username, password)
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null
        setError(body?.error ?? `เกิดข้อผิดพลาด (${err.status})`)
      } else {
        setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      }
    } finally {
      setBusy(false)
    }
  }

  const submitLabel = mode === 'register' ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-kw-cream">
      <form
        onSubmit={submit}
        className="panel w-[360px] p-6 rounded-2xl flex flex-col gap-3"
      >
        <h1 className="text-xl font-bold text-center">อสูรเว็บ Online</h1>

        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className={`btn flex-1 ${mode === 'login' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMode('login')}
          >
            เข้าสู่ระบบ
          </button>
          <button
            type="button"
            className={`btn flex-1 ${mode === 'register' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMode('register')}
          >
            สมัครสมาชิก
          </button>
        </div>

        <label className="text-sm">
          ชื่อผู้ใช้
          <input
            className="w-full mt-1 p-2 rounded border"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            minLength={3}
            maxLength={40}
            required
          />
        </label>

        <label className="text-sm">
          รหัสผ่าน
          <input
            type="password"
            className="w-full mt-1 p-2 rounded border"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={mode === 'register' ? 8 : undefined}
            required
          />
        </label>

        {error && (
          <div className="text-sm text-red-600" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || username.length < 3 || password.length < 1}
        >
          {busy ? 'กำลังทำ...' : submitLabel}
        </button>

        <div className="text-xs text-center text-gray-500">
          ข้อมูลตัวละครเก็บบนเซิร์ฟเวอร์ (ไม่ใช่ localStorage แล้ว)
        </div>
      </form>
    </div>
  )
}
