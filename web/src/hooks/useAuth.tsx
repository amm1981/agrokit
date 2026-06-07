/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiRequest, backendConfigError, setUnauthorizedHandler } from '../services/backend'
import type { EventSummary, ModulePermission } from '../types/models'

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim().toLowerCase() || 'admin@gmail.com'
const SESSION_KEY = 'agrokit_web_session'

export interface AuthUser {
  email: string
  fullName: string
  role: 'admin' | 'pda'
  assignedPdaId: string
  activeEvent: EventSummary | null
  sectorIds: string[]
  accessToken: string
  tokenType: string
  tokenExpiresAt: number
  webRoleCodes: string[]
  modulePermissions: ModulePermission[]
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  error: string | null
  isAdmin: boolean
  adminEmail: string
  hasPermission: (moduleKey: string, action: 'view' | 'create' | 'edit' | 'delete') => boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function loadStoredSession(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthUser>

    const email = String(parsed.email || '').trim().toLowerCase()
    if (!email) return null

    const roleRaw = String(parsed.role || 'pda').trim().toLowerCase()
    const role: 'admin' | 'pda' = roleRaw === 'admin' ? 'admin' : 'pda'
    const accessToken = String(parsed.accessToken || '').trim()
    const tokenExpiresAt = Number(parsed.tokenExpiresAt || 0)
    if (!accessToken || !Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= Date.now()) return null

    return {
      email,
      fullName: String(parsed.fullName || '').trim(),
      role,
      assignedPdaId: String(parsed.assignedPdaId || '').trim(),
      activeEvent: parseAuthEvent(parsed.activeEvent),
      sectorIds: Array.isArray(parsed.sectorIds)
        ? parsed.sectorIds.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      accessToken,
      tokenType: String(parsed.tokenType || 'Bearer').trim() || 'Bearer',
      tokenExpiresAt,
      webRoleCodes: Array.isArray(parsed.webRoleCodes)
        ? parsed.webRoleCodes.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
        : [],
      modulePermissions: parseModulePermissions(parsed.modulePermissions),
    }
  } catch {
    return null
  }
}

function parseModulePermissions(raw: unknown): ModulePermission[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const value = (item ?? {}) as Record<string, unknown>
      const moduleKey = String(value.moduleKey ?? value.module ?? '').trim().toLowerCase()
      if (!moduleKey) return null
      return {
        moduleKey,
        view: value.view === true,
        create: value.create === true,
        edit: value.edit === true,
        delete: value.delete === true,
      } satisfies ModulePermission
    })
    .filter((item): item is ModulePermission => item !== null)
}

function parseAuthEvent(raw: unknown): EventSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const id = String(value.id || '').trim()
  if (!id) return null

  const statusRaw = String(value.status || '').trim().toLowerCase()
  const status: EventSummary['status'] =
    statusRaw === 'draft' || statusRaw === 'closed' || statusRaw === 'archived'
      ? statusRaw
      : 'published'

  return {
    id,
    name: String(value.name || '').trim(),
    startDate: String(value.startDate || '').trim(),
    endDate: String(value.endDate || '').trim(),
    startAt: Number(value.startAt || 0),
    endAt: Number(value.endAt || 0),
    status,
    updatedBy: String(value.updatedBy || '').trim(),
    updatedAt: Number(value.updatedAt || 0),
  }
}

function storeSession(user: AuthUser | null) {
  if (!user) {
    window.localStorage.removeItem(SESSION_KEY)
    return
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredSession())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(backendConfigError)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      storeSession(null)
      setError('Sesion expirada. Inicia sesion nuevamente.')
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    if (!user) return
    const msToExpire = user.tokenExpiresAt - Date.now()
    if (msToExpire <= 0) {
      setUser(null)
      storeSession(null)
      setError('Sesion expirada. Inicia sesion nuevamente.')
      return
    }

    const timer = window.setTimeout(() => {
      setUser(null)
      storeSession(null)
      setError('Sesion expirada. Inicia sesion nuevamente.')
    }, msToExpire + 300)

    return () => window.clearTimeout(timer)
  }, [user])

  useEffect(() => {
    if (!user) return
    storeSession(user)
  }, [user])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      isAdmin: user?.role === 'admin',
      adminEmail: ADMIN_EMAIL,
      hasPermission: (moduleKey: string, action: 'view' | 'create' | 'edit' | 'delete') => {
        if (!user || user.role !== 'admin') return false
        const normalizedModule = moduleKey.trim().toLowerCase()
        const permission = user.modulePermissions.find((item) => item.moduleKey === normalizedModule)
        if (!permission) return false
        return permission[action] === true
      },
      login: async (email: string, password: string) => {
        try {
          setLoading(true)
          setError(backendConfigError)

          const payload = await apiRequest<{
            email: string
            fullName: string
            role: string
            assignedPdaId: string
            activeEvent?: unknown
            sectorIds?: string[]
            accessToken?: string
            tokenType?: string
            expiresAt?: number
            webRoleCodes?: string[]
            webPermissions?: Record<string, { view?: boolean; create?: boolean; edit?: boolean; delete?: boolean }>
          }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
          })

          const roleRaw = String(payload.role || 'pda').trim().toLowerCase()
          const role: 'admin' | 'pda' = roleRaw === 'admin' ? 'admin' : 'pda'
          const authUser: AuthUser = {
            email: String(payload.email || '').trim().toLowerCase(),
            fullName: String(payload.fullName || '').trim(),
            role,
            assignedPdaId: String(payload.assignedPdaId || '').trim(),
            activeEvent: parseAuthEvent(payload.activeEvent),
            sectorIds: Array.isArray(payload.sectorIds)
              ? payload.sectorIds.map((item) => String(item || '').trim()).filter(Boolean)
              : [],
            accessToken: String(payload.accessToken || '').trim(),
            tokenType: String(payload.tokenType || 'Bearer').trim() || 'Bearer',
            tokenExpiresAt: Number(payload.expiresAt || 0),
            webRoleCodes: Array.isArray(payload.webRoleCodes)
              ? payload.webRoleCodes.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
              : [],
            modulePermissions: Object.entries(payload.webPermissions || {}).map(([moduleKey, permission]) => ({
              moduleKey,
              view: permission?.view === true,
              create: permission?.create === true,
              edit: permission?.edit === true,
              delete: permission?.delete === true,
            })),
          }

          if (!authUser.accessToken || !Number.isFinite(authUser.tokenExpiresAt) || authUser.tokenExpiresAt <= Date.now()) {
            setUser(null)
            storeSession(null)
            setError('Respuesta de login invalida: token no emitido')
            throw new Error('Token no emitido por el backend')
          }

          const canAccessWeb = authUser.role === 'admin' && authUser.modulePermissions.some((item) => item.view)
          if (!canAccessWeb) {
            setUser(null)
            storeSession(null)
            setError('Acceso denegado. Usuario sin permisos para el panel web.')
            throw new Error('Usuario sin permisos de administrador')
          }

          setUser(authUser)
          storeSession(authUser)
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : 'No se pudo iniciar sesion'
          setError(message)
          throw cause
        } finally {
          setLoading(false)
        }
      },
      logout: async () => {
        setUser(null)
        storeSession(null)
      },
    }),
    [user, loading, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
