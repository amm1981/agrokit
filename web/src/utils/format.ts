import type { Delivery } from '../types/models'

export function normalizeKitIds(delivery: Partial<Delivery> & { kitId?: string }): string[] {
  const fromArray = Array.isArray(delivery.kitIds)
    ? delivery.kitIds.map((value) => String(value).trim()).filter(Boolean)
    : []

  if (fromArray.length > 0) {
    return fromArray
  }

  const legacyKitId = String(delivery.kitId ?? '').trim()
  return legacyKitId ? [legacyKitId] : []
}

export function formatDateTime(timestamp: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return '-'
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(timestamp))
}

export function toDateTimeLocalValue(timestamp: number | null): string {
  if (!timestamp || Number.isNaN(timestamp)) return ''
  const date = new Date(timestamp)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export function fromDateTimeLocalValue(value: string): number | null {
  if (!value.trim()) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

export function toDateInputValue(timestamp: number | null): string {
  if (!timestamp || Number.isNaN(timestamp)) return ''
  const date = new Date(timestamp)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function fromDateInputValue(value: string, boundary: 'start' | 'end'): number | null {
  const normalized = value.trim()
  if (!normalized) return null
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  if (boundary === 'end') {
    date.setHours(23, 59, 59, 999)
  } else {
    date.setHours(0, 0, 0, 0)
  }
  return date.getTime()
}
