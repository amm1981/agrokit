import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { user, loading, login, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard'

  if (!loading && user) {
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    if (!email.trim() || !password) {
      setLocalError('Ingresa correo y contrasena')
      return
    }

    try {
      setSubmitting(true)
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Credenciales invalidas o sin acceso'
      setLocalError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-emerald-50 to-slate-100 p-4">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <header className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <img src="/AGROCALERA_Negativo.png" alt="Agrocalera" className="h-10 w-auto max-w-[220px] object-contain" />
            <img src="/logo_AgroKit.png" alt="AgroKit" className="h-9 w-auto object-contain" />
          </div>
          <div className="h-px bg-slate-200" />
          <div className="py-1">
            <h1
              className="text-center text-3xl font-semibold text-slate-800"
              style={{ fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif" }}
            >
              Login
            </h1>
          </div>
        </header>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              placeholder="usuario@correo.com"
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Contrasena</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              placeholder="********"
              autoComplete="current-password"
            />
          </label>

          {(localError ?? error) ? <ErrorBanner message={localError ?? error ?? ''} /> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Ingresando...' : 'Iniciar sesion'}
          </button>
        </form>
      </section>
    </div>
  )
}
