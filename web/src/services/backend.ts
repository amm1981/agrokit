const env = import.meta.env as Record<string, string | undefined>

function envValue(key: string): string {
  const direct = env[key]
  if (direct && direct.trim().length > 0) return direct.trim()

  const bomKey = `\uFEFF${key}`
  const withBom = env[bomKey]
  if (withBom && withBom.trim().length > 0) return withBom.trim()

  return ''
}

const explicitBase = envValue('VITE_BACKEND_BASE_URL')
const explicitWs = envValue('VITE_BACKEND_WS_URL')

export const backendBase = explicitBase || 'http://localhost:8081'
export const backendWs = explicitWs || 'ws://localhost:8081/ws'

const missingEnv = [
  !explicitBase ? 'VITE_BACKEND_BASE_URL' : '',
  !explicitWs ? 'VITE_BACKEND_WS_URL' : '',
].filter(Boolean)

export const backendConfigError =
  missingEnv.length > 0
    ? `Variables no definidas (${missingEnv.join(', ')}). Usando fallback local.`
    : null

const SESSION_KEY = 'agrokit_web_session'
let onUnauthorizedHandler: (() => void) | null = null

function readAccessTokenFromSession(): string {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { accessToken?: string }
    return String(parsed.accessToken || '').trim()
  } catch {
    return ''
  }
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorizedHandler = handler
}

export async function apiRequest<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${backendBase}${path.startsWith('/') ? path : `/${path}`}`
  const accessToken = readAccessTokenFromSession()
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(url, {
    ...init,
    headers,
  })

  const text = await response.text()
  const parsed = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message =
      typeof parsed?.message === 'string' && parsed.message.trim().length > 0
        ? parsed.message
        : `HTTP ${response.status}`
    if (response.status === 401 && typeof onUnauthorizedHandler === 'function') {
      onUnauthorizedHandler()
    }
    throw new Error(message)
  }

  return parsed as T
}

export function createBackendWebSocket(): WebSocket {
  const token = readAccessTokenFromSession()
  if (!token) {
    return new WebSocket(backendWs)
  }
  const separator = backendWs.includes('?') ? '&' : '?'
  return new WebSocket(`${backendWs}${separator}token=${encodeURIComponent(token)}`)
}
