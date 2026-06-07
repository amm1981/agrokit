/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './useAuth'
import { apiRequest, backendConfigError, createBackendWebSocket } from '../services/backend'
import type {
  Delivery,
  DeliveryProductItem,
  DeliveryWindow,
  EventSummary,
  Kit,
  KitProduct,
  ProductStockSummary,
  Sector,
  UserProfile,
  Worker,
} from '../types/models'
import { normalizeKitIds } from '../utils/format'

const SELECTED_EVENT_KEY = 'agrokit_web_selected_event'

interface RealtimeDataContextValue {
  workers: Worker[]
  kits: Kit[]
  deliveries: Delivery[]
  users: UserProfile[]
  deliveryWindow: DeliveryWindow | null
  productStocks: ProductStockSummary[]
  events: EventSummary[]
  sectors: Sector[]
  eventSectors: Sector[]
  selectedEventId: string
  setSelectedEventId: (eventId: string) => void
  loading: boolean
  error: string | null
}

const RealtimeDataContext = createContext<RealtimeDataContextValue | undefined>(undefined)

function sortWorkers(items: Worker[]): Worker[] {
  return [...items].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es'))
}

function sortKits(items: Kit[]): Kit[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

function sortUsers(items: UserProfile[]): UserProfile[] {
  return [...items].sort((a, b) => a.email.localeCompare(b.email, 'es'))
}

function sortProductStocks(items: ProductStockSummary[]): ProductStockSummary[] {
  return [...items].sort((a, b) => a.productName.localeCompare(b.productName, 'es'))
}

function sortEvents(items: EventSummary[]): EventSummary[] {
  return [...items].sort((a, b) => b.startAt - a.startAt)
}

function parseWorkers(rows: unknown): Worker[] {
  if (!Array.isArray(rows)) return []
  const mapped = rows
    .map((raw) => {
      const value = (raw ?? {}) as Record<string, unknown>
      const dni = String(value.dni ?? '').trim()
      const nombreCompleto = String(value.nombreCompleto ?? '').trim()
      const area = String(value.area ?? '').trim()
      const gerencia = String(value.gerencia ?? value.centroDeCosto ?? '').trim()
      const sectorId = String(value.sectorId ?? '').trim()
      const sectorNombre = String(value.sectorNombre ?? '').trim()
      const eventId = String(value.eventId ?? '').trim()
      const hasDeliveries = value.hasDeliveries === true || Number(value.hasDeliveries ?? 0) === 1
      if (!dni || !nombreCompleto) return null
      return { dni, nombreCompleto, area, gerencia, sectorId, sectorNombre, eventId, hasDeliveries } satisfies Worker
    })
    .filter((item): item is Worker => item !== null)
  return sortWorkers(mapped)
}

function parseKitProducts(rawProducts: unknown): KitProduct[] {
  if (!Array.isArray(rawProducts)) return []
  return rawProducts
    .map((raw) => {
      const value = (raw ?? {}) as Record<string, unknown>
      const id = String(value.id ?? '').trim()
      const name = String(value.name ?? '').trim()
      const quantity = Number(value.quantity ?? 1)
      if (!id || !name) return null
      return {
        id,
        name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      } satisfies KitProduct
    })
    .filter((item): item is KitProduct => item !== null)
}

function parseKits(rows: unknown): Kit[] {
  if (!Array.isArray(rows)) return []
  const mapped = rows
    .map((raw) => {
      const value = (raw ?? {}) as Record<string, unknown>
      const id = String(value.id ?? '').trim()
      const name = String(value.name ?? '').trim()
      const eventId = String(value.eventId ?? '').trim()
      if (!id || !name) return null
      return {
        id,
        name,
        eventId,
        products: parseKitProducts(value.products),
      } satisfies Kit
    })
    .filter((item): item is Kit => item !== null)
  return sortKits(mapped)
}

function parseDeliveries(rows: unknown): Delivery[] {
  if (!Array.isArray(rows)) return []

  return rows
    .map((raw) => {
      const value = (raw ?? {}) as Record<string, unknown>
      const id = String(value.id ?? '').trim()
      const workerDni = String(value.workerDni ?? '').trim()
      const timestamp = Number(value.timestamp ?? 0)
      const photoPath = String(value.photoPath ?? '').trim()
      const pdaId = String(value.pdaId ?? '').trim()
      const userEmail = String(value.userEmail ?? 'sin_usuario').trim()
      const eventId = String(value.eventId ?? '').trim()
      const sectorId = String(value.sectorId ?? '').trim()
      const products = parseDeliveryProducts(value.products)
      const kitIds = normalizeKitIds({
        kitIds: Array.isArray(value.kitIds) ? value.kitIds.map((item) => String(item)) : undefined,
        kitId: value.kitId ? String(value.kitId) : undefined,
      })

      if (!id || !workerDni) return null

      return {
        id,
        workerDni,
        kitIds,
        products,
        timestamp,
        photoPath,
        pdaId,
        userEmail,
        eventId,
        sectorId,
      } satisfies Delivery
    })
    .filter((item): item is Delivery => item !== null)
}

function parseDeliveryProducts(raw: unknown): DeliveryProductItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const value = (item ?? {}) as Record<string, unknown>
      const kitCode = String(value.kitCode ?? '').trim()
      const productCode = String(value.productCode ?? value.id ?? '').trim()
      const productName = String(value.productName ?? value.name ?? productCode).trim()
      const quantity = Number(value.quantity ?? 0)
      if (!productCode || !Number.isFinite(quantity) || quantity <= 0) return null
      return {
        kitCode,
        productCode,
        productName,
        quantity,
      } satisfies DeliveryProductItem
    })
    .filter((item): item is DeliveryProductItem => item !== null)
}

function parseUsers(rows: unknown): UserProfile[] {
  if (!Array.isArray(rows)) return []

  const mapped = rows
    .map((raw) => {
      const value = (raw ?? {}) as Record<string, unknown>
      const email = String(value.email ?? '').trim().toLowerCase()
      if (!email) return null

      const roleRaw = String(value.role ?? 'pda').trim().toLowerCase()
      const role: 'admin' | 'pda' = roleRaw === 'admin' ? 'admin' : 'pda'
      const sectorIds = Array.isArray(value.sectorIds)
        ? value.sectorIds.map((item) => String(item || '').trim()).filter(Boolean)
        : []

      return {
        uid: String(value.uid ?? email).trim() || email,
        email,
        fullName: String(value.fullName ?? '').trim(),
        assignedPdaId: String(value.assignedPdaId ?? '').trim(),
        role,
        active: value.active === false ? false : true,
        createdAt: Number(value.createdAt ?? 0),
        createdBy: String(value.createdBy ?? '').trim(),
        eventId: String(value.eventId ?? '').trim(),
        sectorIds,
      } satisfies UserProfile
    })
    .filter((item): item is UserProfile => item !== null)

  return sortUsers(mapped)
}

function parseDeliveryWindow(raw: unknown): DeliveryWindow | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>

  const enabled = value.enabled === true
  const startAtRaw = Number(value.startAt ?? 0)
  const endAtRaw = Number(value.endAt ?? 0)
  const updatedAt = Number(value.updatedAt ?? 0)
  const updatedBy = String(value.updatedBy ?? '').trim()
  const eventId = String(value.eventId ?? '').trim()
  const startDate = String(value.startDate ?? '').trim() || (startAtRaw > 0 ? new Date(startAtRaw).toISOString().slice(0, 10) : '')
  const endDate = String(value.endDate ?? '').trim() || (endAtRaw > 0 ? new Date(endAtRaw).toISOString().slice(0, 10) : '')

  return {
    enabled,
    startAt: Number.isFinite(startAtRaw) && startAtRaw > 0 ? startAtRaw : null,
    endAt: Number.isFinite(endAtRaw) && endAtRaw > 0 ? endAtRaw : null,
    startDate,
    endDate,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    updatedBy,
    eventId,
  } satisfies DeliveryWindow
}

function parseEvents(rows: unknown): EventSummary[] {
  if (!Array.isArray(rows)) return []
  const mapped = rows
    .map((raw) => {
      const value = (raw ?? {}) as Record<string, unknown>
      const id = String(value.id ?? '').trim()
      const name = String(value.name ?? '').trim()
      const startAt = Number(value.startAt ?? 0)
      const endAt = Number(value.endAt ?? 0)
      const startDateRaw = String(value.startDate ?? '').trim()
      const endDateRaw = String(value.endDate ?? '').trim()
      if (!id || !name || !Number.isFinite(startAt) || !Number.isFinite(endAt)) return null
      const startDate = startDateRaw || new Date(startAt).toISOString().slice(0, 10)
      const endDate = endDateRaw || new Date(endAt).toISOString().slice(0, 10)

      const statusRaw = String(value.status ?? '').trim().toLowerCase()
      const status: EventSummary['status'] =
        statusRaw === 'draft' || statusRaw === 'closed' || statusRaw === 'archived'
          ? statusRaw
          : 'published'

      return {
        id,
        name,
        startDate,
        endDate,
        startAt,
        endAt,
        status,
        updatedBy: String(value.updatedBy ?? '').trim(),
        updatedAt: Number(value.updatedAt ?? 0),
      } satisfies EventSummary
    })
    .filter((item): item is EventSummary => item !== null)
  return sortEvents(mapped)
}

function parseSectors(rows: unknown): Sector[] {
  if (!Array.isArray(rows)) return []
  return rows
    .map((raw) => {
      const value = (raw ?? {}) as Record<string, unknown>
      const id = String(value.id ?? '').trim()
      const name = String(value.name ?? '').trim()
      if (!id || !name) return null
      return {
        id,
        name,
        active: value.active !== false,
      } satisfies Sector
    })
    .filter((item): item is Sector => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

function parseProductStocks(rows: unknown): ProductStockSummary[] {
  if (!Array.isArray(rows)) return []
  return rows
    .map((raw) => {
      const value = (raw ?? {}) as Record<string, unknown>
      const productCode = String(value.productCode ?? '').trim()
      const productName = String(value.productName ?? '').trim()
      const eventId = String(value.eventId ?? '').trim()
      if (!productCode || !productName) return null
      const sectorStocks = Array.isArray(value.sectorStocks)
        ? value.sectorStocks
            .map((rawSector) => {
              const sectorValue = (rawSector ?? {}) as Record<string, unknown>
              const sectorId = String(sectorValue.sectorId ?? '').trim()
              if (!sectorId) return null
              return {
                sectorId,
                sectorName: String(sectorValue.sectorName ?? sectorId).trim() || sectorId,
                stockQuantity: Number(sectorValue.stockQuantity ?? 0),
              }
            })
            .filter((item): item is { sectorId: string; sectorName: string; stockQuantity: number } => item !== null)
        : []

      return {
        eventId,
        productCode,
        productName,
        perBeneficiaryQuantity: Number(value.perBeneficiaryQuantity ?? 0),
        beneficiariesCount: Number(value.beneficiariesCount ?? 0),
        requiredQuantity: Number(value.requiredQuantity ?? 0),
        stockQuantity: Number(value.stockQuantity ?? 0),
        sectorStockQuantity: Number(value.sectorStockQuantity ?? sectorStocks.reduce((acc, item) => acc + Number(item.stockQuantity || 0), 0)),
        sectorStocks,
        deliveredQuantity: Number(value.deliveredQuantity ?? 0),
        availableQuantity: Number(value.availableQuantity ?? 0),
        sufficientForBeneficiaries: value.sufficientForBeneficiaries !== false,
      } satisfies ProductStockSummary
    })
    .filter((item): item is ProductStockSummary => item !== null)
    .sort((a, b) => a.productName.localeCompare(b.productName, 'es'))
}

function readStoredEventId(): string {
  return window.localStorage.getItem(SELECTED_EVENT_KEY)?.trim() || ''
}

function storeEventId(eventId: string) {
  if (eventId.trim()) {
    window.localStorage.setItem(SELECTED_EVENT_KEY, eventId.trim())
    return
  }
  window.localStorage.removeItem(SELECTED_EVENT_KEY)
}

export function RealtimeDataProvider({ children }: { children: ReactNode }) {
  const { user, hasPermission } = useAuth()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [kits, setKits] = useState<Kit[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [users, setUsers] = useState<UserProfile[]>([])
  const [deliveryWindow, setDeliveryWindow] = useState<DeliveryWindow | null>(null)
  const [productStocks, setProductStocks] = useState<ProductStockSummary[]>([])
  const [events, setEvents] = useState<EventSummary[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [eventSectors, setEventSectors] = useState<Sector[]>([])
  const [selectedEventId, setSelectedEventIdState] = useState<string>(() => readStoredEventId())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(backendConfigError)

  const wsRef = useRef<WebSocket | null>(null)
  const canViewEventos = hasPermission('eventos', 'view')
  const canViewTrabajadores = hasPermission('trabajadores', 'view')
  const canViewKits = hasPermission('kits', 'view')
  const canViewEntregas = hasPermission('entregas', 'view')
  const canViewUsuariosPda = hasPermission('usuarios_pda', 'view')

  const setSelectedEventId = (eventId: string) => {
    const normalized = eventId.trim()
    setSelectedEventIdState(normalized)
    storeEventId(normalized)
  }

  useEffect(() => {
    if (selectedEventId) {
      storeEventId(selectedEventId)
    }
  }, [selectedEventId])

  useEffect(() => {
    let disposed = false

    async function fetchEntityData(eventId: string, eventList?: EventSummary[]) {
      const query = `eventId=${encodeURIComponent(eventId)}`
      const userQuery = user?.email ? `&userEmail=${encodeURIComponent(user.email)}` : ''

      const [workersRes, kitsRes, deliveriesRes, usersRes, windowRes, eventSectorsRes, productsRes] = await Promise.all([
        canViewTrabajadores ? apiRequest<unknown[]>(`/api/workers?${query}`) : Promise.resolve([]),
        canViewKits ? apiRequest<unknown[]>(`/api/kits?${query}`) : Promise.resolve([]),
        canViewEntregas ? apiRequest<unknown[]>(`/api/deliveries?${query}${userQuery}`) : Promise.resolve([]),
        canViewUsuariosPda ? apiRequest<unknown[]>(`/api/users?${query}`) : Promise.resolve([]),
        canViewEntregas ? apiRequest<unknown>(`/api/settings/delivery-window?${query}`) : Promise.resolve(null),
        apiRequest<unknown[]>(`/api/sectors?${query}`),
        canViewKits ? apiRequest<unknown[]>(`/api/products?${query}`) : Promise.resolve([]),
      ])

      if (disposed) return

      setWorkers(parseWorkers(workersRes))
      setKits(parseKits(kitsRes))
      setDeliveries(parseDeliveries(deliveriesRes))
      setUsers(parseUsers(usersRes))
      setDeliveryWindow(parseDeliveryWindow(windowRes))
      setEventSectors(parseSectors(eventSectorsRes))
      setProductStocks(parseProductStocks(productsRes))
      if (eventList) {
        setEvents(eventList)
      }
      setError(null)
    }

    async function bootstrap() {
      try {
        setLoading(true)
        setError(backendConfigError)

        const [eventsRes, sectorsRes] = await Promise.all([
          canViewEventos ? apiRequest<unknown[]>('/api/events') : Promise.resolve([]),
          apiRequest<unknown[]>('/api/sectors'),
        ])

        if (disposed) return

        const parsedEvents = parseEvents(eventsRes)
        const effectiveEvents =
          parsedEvents.length > 0
            ? parsedEvents
            : user?.activeEvent
              ? [user.activeEvent]
              : []
        const parsedSectors = parseSectors(sectorsRes)
        setSectors(parsedSectors)
        setEvents(effectiveEvents)

        const eventIds = new Set(effectiveEvents.map((event) => event.id))
        const fallbackEventId = user?.activeEvent?.id || effectiveEvents[0]?.id || ''
        const candidate = selectedEventId && eventIds.has(selectedEventId) ? selectedEventId : fallbackEventId

        if (!candidate) {
          setWorkers([])
          setKits([])
          setDeliveries([])
          setUsers([])
          setDeliveryWindow(null)
          setEventSectors([])
          setProductStocks([])
          setError('No existen eventos configurados. Crea uno desde el panel de eventos.')
          return
        }

        if (candidate !== selectedEventId) {
          setSelectedEventId(candidate)
        }

        await fetchEntityData(candidate, effectiveEvents)
      } catch (cause) {
        if (disposed) return
        const message = cause instanceof Error ? cause.message : 'No se pudo cargar data del backend'
        setError(message)
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    void bootstrap()

    return () => {
      disposed = true
    }
  }, [
    selectedEventId,
    user?.email,
    user?.activeEvent,
    user?.activeEvent?.id,
    canViewEntregas,
    canViewEventos,
    canViewKits,
    canViewTrabajadores,
    canViewUsuariosPda,
  ])

  useEffect(() => {
    if (!selectedEventId) return
    let disposed = false
    const refreshInFlight = new Set<string>()
    const refreshTimers = new Map<string, ReturnType<typeof window.setTimeout>>()
    let connectTimer: ReturnType<typeof window.setTimeout> | null = null
    let reconnectTimer: ReturnType<typeof window.setTimeout> | null = null

    async function refreshEntity(entity: string) {
      if (refreshInFlight.has(entity)) return
      refreshInFlight.add(entity)

      try {
        const query = `eventId=${encodeURIComponent(selectedEventId)}`
        const userQuery = user?.email ? `&userEmail=${encodeURIComponent(user.email)}` : ''

        if (entity === 'workers') {
          if (!canViewTrabajadores) {
            if (!disposed) setWorkers([])
            return
          }
          const res = await apiRequest<unknown[]>(`/api/workers?${query}`)
          if (!disposed) setWorkers(parseWorkers(res))
          return
        }
        if (entity === 'kits') {
          if (!canViewKits) {
            if (!disposed) setKits([])
            return
          }
          const res = await apiRequest<unknown[]>(`/api/kits?${query}`)
          if (!disposed) setKits(parseKits(res))
          return
        }
        if (entity === 'deliveries') {
          if (!canViewEntregas) {
            if (!disposed) setDeliveries([])
            return
          }
          const res = await apiRequest<unknown[]>(`/api/deliveries?${query}${userQuery}`)
          if (!disposed) setDeliveries(parseDeliveries(res))
          return
        }
        if (entity === 'users') {
          if (!canViewUsuariosPda) {
            if (!disposed) setUsers([])
            return
          }
          const res = await apiRequest<unknown[]>(`/api/users?${query}`)
          if (!disposed) setUsers(parseUsers(res))
          return
        }
        if (entity === 'settings.deliveryWindow') {
          if (!canViewEntregas) {
            if (!disposed) setDeliveryWindow(null)
            return
          }
          const res = await apiRequest<unknown>(`/api/settings/delivery-window?${query}`)
          if (!disposed) setDeliveryWindow(parseDeliveryWindow(res))
          return
        }
        if (entity === 'events') {
          if (!canViewEventos) return
          const res = await apiRequest<unknown[]>('/api/events')
          if (!disposed) setEvents(parseEvents(res))
          return
        }
        if (entity === 'sectors') {
          const [catalogRes, eventRes] = await Promise.all([
            apiRequest<unknown[]>('/api/sectors'),
            apiRequest<unknown[]>(`/api/sectors?${query}`),
          ])
          if (disposed) return
          setSectors(parseSectors(catalogRes))
          setEventSectors(parseSectors(eventRes))
          return
        }
        if (entity === 'products.stock') {
          if (!canViewKits) {
            if (!disposed) setProductStocks([])
            return
          }
          const res = await apiRequest<unknown[]>(`/api/products?${query}`)
          if (!disposed) setProductStocks(parseProductStocks(res))
        }
      } catch (cause) {
        if (disposed) return
        const message = cause instanceof Error ? cause.message : 'No se pudo refrescar datos'
        setError(message)
      } finally {
        refreshInFlight.delete(entity)
      }
    }

    function scheduleRefreshEntity(entity: string) {
      if (entity !== 'products.stock') {
        void refreshEntity(entity)
        return
      }

      const currentTimer = refreshTimers.get(entity)
      if (currentTimer) {
        window.clearTimeout(currentTimer)
      }

      const timer = window.setTimeout(() => {
        refreshTimers.delete(entity)
        void refreshEntity(entity)
      }, 250)
      refreshTimers.set(entity, timer)
    }

    function connectWs() {
      if (disposed) return

      try {
        const ws = createBackendWebSocket()
        wsRef.current = ws

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data ?? '{}')) as Record<string, unknown>
            const entity = String(payload.entity ?? '').trim()
            const action = String(payload.action ?? '').trim()
            const data = (payload.payload ?? null) as unknown
            const eventIdFromPayload = String(payload.eventId ?? '').trim()
            const eventIdFromData = String((data as Record<string, unknown> | null)?.eventId ?? '').trim()
            const scopedEventId = eventIdFromPayload || eventIdFromData

            if (!entity) return
            const scopedEntities = new Set(['workers', 'kits', 'deliveries', 'users', 'settings.deliveryWindow', 'products.stock'])
            if (scopedEntities.has(entity) && scopedEventId && scopedEventId !== selectedEventId) {
              return
            }

            if (action === 'refresh') {
              scheduleRefreshEntity(entity)
              return
            }

            if (entity === 'workers') {
              if (action === 'upsert') {
                const parsed = parseWorkers([data])[0]
                if (!parsed) return
                setWorkers((current) => sortWorkers([...current.filter((item) => item.dni !== parsed.dni), parsed]))
                return
              }
              if (action === 'delete') {
                const id = String(payload.id ?? '').trim()
                if (!id) return
                setWorkers((current) => current.filter((item) => item.dni !== id))
              }
              return
            }

            if (entity === 'kits') {
              if (action === 'upsert') {
                const parsed = parseKits([data])[0]
                if (!parsed) return
                setKits((current) => sortKits([...current.filter((item) => item.id !== parsed.id), parsed]))
                return
              }
              if (action === 'delete') {
                const id = String(payload.id ?? '').trim()
                if (!id) return
                setKits((current) => current.filter((item) => item.id !== id))
              }
              return
            }

            if (entity === 'deliveries') {
              if (action === 'upsert') {
                const parsed = parseDeliveries([data])[0]
                if (!parsed) return
                setDeliveries((current) => {
                  const next = [...current.filter((item) => item.id !== parsed.id), parsed]
                  return next.sort((a, b) => b.timestamp - a.timestamp)
                })
                return
              }
              if (action === 'delete') {
                const id = String(payload.id ?? '').trim()
                if (!id) return
                setDeliveries((current) => current.filter((item) => item.id !== id))
                return
              }
            }

            if (entity === 'users') {
              if (action === 'upsert') {
                const parsed = parseUsers([data])[0]
                if (!parsed) return
                setUsers((current) => sortUsers([...current.filter((item) => item.email !== parsed.email), parsed]))
              }
              return
            }

            if (entity === 'settings.deliveryWindow' && action === 'upsert') {
              const parsed = parseDeliveryWindow(data)
              if (!parsed || (parsed.eventId && parsed.eventId !== selectedEventId)) return
              setDeliveryWindow(parsed)
              return
            }

            if (entity === 'events') {
              if (action === 'upsert') {
                const parsed = parseEvents([data])[0]
                if (!parsed) return
                setEvents((current) => sortEvents([...current.filter((item) => item.id !== parsed.id), parsed]))
                return
              }
              void refreshEntity('events')
              return
            }

            if (entity === 'products.stock') {
              if (action === 'upsert') {
                const parsed = parseProductStocks([data])[0]
                if (!parsed || (parsed.eventId && parsed.eventId !== selectedEventId)) return
                setProductStocks((current) =>
                  sortProductStocks([...current.filter((item) => item.productCode !== parsed.productCode), parsed]),
                )
                return
              }
              scheduleRefreshEntity('products.stock')
            }
          } catch {
            // Ignorar payload WS malformado
          }
        }

        ws.onerror = () => {
          setError((current) => current ?? 'Conexion WebSocket con errores')
        }

        ws.onclose = () => {
          if (!disposed) {
            reconnectTimer = window.setTimeout(() => {
              if (!disposed) connectWs()
            }, 3000)
          }
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'No se pudo abrir WebSocket'
        setError(message)
      }
    }

    connectTimer = window.setTimeout(connectWs, 50)

    return () => {
      disposed = true
      if (connectTimer) window.clearTimeout(connectTimer)
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      refreshTimers.forEach((timer) => window.clearTimeout(timer))
      refreshTimers.clear()
      const currentWs = wsRef.current
      if (currentWs) {
        currentWs.onmessage = null
        currentWs.onerror = null
        currentWs.onclose = null
        if (currentWs.readyState === WebSocket.CONNECTING) {
          currentWs.onopen = () => currentWs.close()
        } else {
          currentWs.close()
        }
      }
      wsRef.current = null
    }
  }, [
    selectedEventId,
    user?.email,
    canViewEntregas,
    canViewEventos,
    canViewKits,
    canViewTrabajadores,
    canViewUsuariosPda,
  ])

  const value = useMemo<RealtimeDataContextValue>(
    () => ({
      workers,
      kits,
      deliveries,
      users,
      deliveryWindow,
      productStocks,
      events,
      sectors,
      eventSectors,
      selectedEventId,
      setSelectedEventId,
      loading,
      error,
    }),
    [
      workers,
      kits,
      deliveries,
      users,
      deliveryWindow,
      productStocks,
      events,
      sectors,
      eventSectors,
      selectedEventId,
      loading,
      error,
    ],
  )

  return <RealtimeDataContext.Provider value={value}>{children}</RealtimeDataContext.Provider>
}

export function useRealtimeData() {
  const context = useContext(RealtimeDataContext)
  if (!context) {
    throw new Error('useRealtimeData debe usarse dentro de RealtimeDataProvider')
  }
  return context
}
