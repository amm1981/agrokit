import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { user, loading, login, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      setLocalError('Ingresa correo y contraseña')
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
    <main className="min-h-screen bg-[#f6faf8] p-4 text-slate-900 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[1500px] gap-6 sm:min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.13fr_1fr]">
        <section className="hidden overflow-hidden rounded-3xl shadow-[0_28px_80px_rgba(15,23,42,0.16)] lg:block">
          <img
            src="/Entregas_login.png"
            alt="Entrega AgroKit"
            className="h-full min-h-[720px] w-full object-cover object-[44%_center]"
          />
        </section>

        <section className="relative flex min-h-[720px] overflow-hidden rounded-3xl border border-white/80 bg-[radial-gradient(circle_at_8%_8%,rgba(14,111,67,0.09),transparent_30%),linear-gradient(145deg,#ffffff_0%,#eef7f3_100%)] px-4 py-8 shadow-[0_26px_90px_rgba(15,23,42,0.12)] sm:px-8 lg:px-10">
          <DecorativeLeaf className="-right-8 -top-10 h-56 w-56 rotate-12 opacity-[0.08]" />
          <DecorativeLeaf className="right-10 top-28 h-36 w-36 opacity-[0.07]" />
          <DecorativeLeaf className="-bottom-12 right-4 h-56 w-56 -rotate-45 opacity-[0.07]" />

          <div className="relative z-10 flex w-full flex-col items-center justify-center">
            <div className="w-full max-w-[484px] rounded-2xl border border-white/80 bg-white/95 p-6 shadow-[0_22px_60px_rgba(15,23,42,0.14)] backdrop-blur sm:p-10">
              <header className="mb-8 text-center">
                <img src="/logo_AgroKit.png" alt="AgroKit" className="mx-auto h-20 w-auto object-contain sm:h-[86px]" />
              </header>

              <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-[34px]">Bienvenido</h1>
                <p className="mt-3 text-base text-slate-500">Inicia sesión para continuar</p>
              </div>

              <form className="space-y-6" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-800">Correo electrónico</span>
                  <span className="flex h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-slate-500 shadow-sm transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
                    <MailIcon className="h-5 w-5 shrink-0" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      placeholder="usuario@correo.com"
                      autoComplete="email"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-800">Contraseña</span>
                  <span className="flex h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-slate-500 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
                    <LockIcon className="h-5 w-5 shrink-0" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      placeholder="Ingresa tu contraseña"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      <EyeIcon className="h-5 w-5" />
                    </button>
                  </span>
                </label>

                {(localError ?? error) ? <ErrorBanner message={localError ?? error ?? ''} /> : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="h-12 w-full rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(5,150,105,0.24)] transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Ingresando...' : 'Iniciar sesión'}
                </button>
              </form>
            </div>

            <p className="mt-auto pt-8 text-center text-sm text-slate-500">© 2026 AgroCalera. Todos los derechos reservados.</p>
          </div>
        </section>
      </div>
    </main>
  )
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.75 6.75h14.5v10.5H4.75V6.75Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m5.25 7.25 6.75 5 6.75-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7.5 10.25h9v8h-9v-8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9.25 10.25V8.5a2.75 2.75 0 0 1 5.5 0v1.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 13.5v1.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.75 12s2.75-5 8.25-5 8.25 5 8.25 5-2.75 5-8.25 5-8.25-5-8.25-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 14.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function DecorativeLeaf({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 180" fill="none" className={`pointer-events-none absolute text-emerald-700 ${className ?? ''}`} aria-hidden="true">
      <path
        d="M151.5 26.6C87.5 26.6 35.6 78.5 35.6 142.5c64 0 115.9-51.9 115.9-115.9Z"
        fill="currentColor"
      />
      <path d="M36 142c38-43 78-77 116-115" stroke="white" strokeOpacity="0.55" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}
