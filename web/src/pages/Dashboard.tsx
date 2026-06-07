import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { Loader } from '../components/Loader'
import { PageHeader } from '../components/PageHeader'
import { useRealtimeData } from '../hooks/useRealtimeData'

type DatePreset = 'HOY' | 'ULTIMOS_7_DIAS' | 'PERSONALIZADO'

interface DateFilterState {
  eventId: string
  preset: DatePreset
  customStartDate: string
  customEndDate: string
}

const CHART_COLORS = {
  delivered: '#059669',
  pending: '#94a3b8',
  sector: '#2563eb',
  gerencia: '#7c3aed',
}

function toDayBounds(date: Date): { start: number; end: number } {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start: start.getTime(), end: end.getTime() }
}

function toDateRange(
  preset: DatePreset,
  customStartDate: string,
  customEndDate: string,
): { start: number | null; end: number | null } {
  const now = new Date()
  if (preset === 'HOY') {
    return toDayBounds(now)
  }
  if (preset === 'ULTIMOS_7_DIAS') {
    const end = toDayBounds(now).end
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 6)
    return { start: toDayBounds(startDate).start, end }
  }

  if (!customStartDate || !customEndDate) {
    return { start: null, end: null }
  }

  const startDate = new Date(`${customStartDate}T00:00:00`)
  const endDate = new Date(`${customEndDate}T23:59:59.999`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { start: null, end: null }
  }
  if (startDate.getTime() > endDate.getTime()) {
    return { start: null, end: null }
  }

  return { start: startDate.getTime(), end: endDate.getTime() }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(value)
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(value)}%`
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function toInputDate(value: string | undefined, timestamp: number | undefined): string {
  const raw = (value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw
  }

  const parsedFromRaw = raw ? new Date(raw) : null
  if (parsedFromRaw && !Number.isNaN(parsedFromRaw.getTime())) {
    const year = parsedFromRaw.getFullYear()
    const month = String(parsedFromRaw.getMonth() + 1).padStart(2, '0')
    const day = String(parsedFromRaw.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    const parsedFromMs = new Date(timestamp)
    const year = parsedFromMs.getFullYear()
    const month = String(parsedFromMs.getMonth() + 1).padStart(2, '0')
    const day = String(parsedFromMs.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return ''
}

function KpiCard({
  title,
  value,
  helper,
  tone = 'default',
}: {
  title: string
  value: string | number
  helper: ReactNode
  tone?: 'default' | 'success' | 'warning'
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-white'

  return (
    <article className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </article>
  )
}

function Panel({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </article>
  )
}

function ChartEmpty({ label = 'Sin datos para graficar' }: { label?: string }) {
  return <p className="flex h-64 items-center justify-center text-sm text-slate-500">{label}</p>
}

function buildEventDateFilter(eventId: string, event?: { startDate?: string; endDate?: string; startAt?: number; endAt?: number }) {
  const startFromEvent = toInputDate(event?.startDate, event?.startAt)
  const endFromEvent = toInputDate(event?.endDate, event?.endAt)

  if (startFromEvent && endFromEvent) {
    return {
      eventId,
      preset: 'PERSONALIZADO',
      customStartDate: startFromEvent,
      customEndDate: endFromEvent,
    } satisfies DateFilterState
  }

  return {
    eventId,
    preset: 'HOY',
    customStartDate: '',
    customEndDate: '',
  } satisfies DateFilterState
}

export function DashboardPage() {
  const { workers, deliveries, deliveryWindow, productStocks, events, selectedEventId, eventSectors, loading, error } =
    useRealtimeData()

  const [sectorFilter, setSectorFilter] = useState('TODOS')
  const [gerenciaFilter, setGerenciaFilter] = useState('TODOS')
  const [userDateFilter, setUserDateFilter] = useState<DateFilterState | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const selectedEvent = useMemo(
    () => events.find((item) => item.id === selectedEventId),
    [events, selectedEventId],
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const defaultDateFilter = useMemo(
    () => buildEventDateFilter(selectedEventId, selectedEvent),
    [selectedEventId, selectedEvent],
  )

  const activeDateFilter =
    userDateFilter?.eventId === selectedEventId ? userDateFilter : defaultDateFilter
  const { preset: datePreset, customStartDate, customEndDate } = activeDateFilter

  function updateDateFilter(partial: Partial<Omit<DateFilterState, 'eventId'>>) {
    setUserDateFilter({
      ...activeDateFilter,
      ...partial,
      eventId: selectedEventId,
    })
  }

  const selectedDateRange = useMemo(
    () => toDateRange(datePreset, customStartDate, customEndDate),
    [datePreset, customStartDate, customEndDate],
  )

  const hasInvalidCustomDateRange =
    datePreset === 'PERSONALIZADO' &&
    (!customStartDate || !customEndDate || selectedDateRange.start == null || selectedDateRange.end == null)

  const sectorOptions = useMemo(() => {
    const map = new Map<string, string>()
    eventSectors.forEach((sector) => map.set(sector.id, sector.name))
    workers.forEach((worker) => {
      if (worker.sectorId && !map.has(worker.sectorId)) {
        map.set(worker.sectorId, worker.sectorNombre || worker.sectorId)
      }
    })
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [eventSectors, workers])

  const gerenciaOptions = useMemo(() => {
    return Array.from(new Set(workers.map((worker) => worker.gerencia).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'es'),
    )
  }, [workers])

  const workerByDni = useMemo(() => {
    return new Map(
      workers.map((worker) => [
        worker.dni,
        {
          ...worker,
          gerencia: worker.gerencia || '-',
          sectorId: worker.sectorId || '-',
          sectorNombre: worker.sectorNombre || worker.sectorId || '-',
        },
      ]),
    )
  }, [workers])

  const filteredDeliveries = useMemo(() => {
    return deliveries
      .map((delivery) => {
        const worker = workerByDni.get(delivery.workerDni)
        const sectorId = worker?.sectorId || delivery.sectorId || '-'
        const sectorName = worker?.sectorNombre || sectorOptions.find((item) => item.id === sectorId)?.name || sectorId
        const gerencia = worker?.gerencia || '-'
        const totalUnits = delivery.products.reduce((acc, item) => acc + Number(item.quantity || 0), 0)

        return {
          ...delivery,
          workerName: worker?.nombreCompleto || 'Sin nombre',
          sectorId,
          sectorName,
          gerencia,
          totalUnits,
        }
      })
      .filter((row) => {
        const inDateRange = hasInvalidCustomDateRange
          ? false
          : selectedDateRange.start == null || selectedDateRange.end == null
            ? true
            : row.timestamp >= selectedDateRange.start && row.timestamp <= selectedDateRange.end

        return (
          inDateRange &&
          (sectorFilter === 'TODOS' || row.sectorId === sectorFilter) &&
          (gerenciaFilter === 'TODOS' || row.gerencia === gerenciaFilter)
        )
      })
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [
    deliveries,
    workerByDni,
    sectorOptions,
    selectedDateRange,
    hasInvalidCustomDateRange,
    sectorFilter,
    gerenciaFilter,
  ])

  const filteredWorkers = useMemo(() => {
    return workers.filter((worker) => {
      return (
        (sectorFilter === 'TODOS' || worker.sectorId === sectorFilter) &&
        (gerenciaFilter === 'TODOS' || worker.gerencia === gerenciaFilter)
      )
    })
  }, [workers, sectorFilter, gerenciaFilter])

  const deliveredByProduct = useMemo(() => {
    const map = new Map<string, number>()
    filteredDeliveries.forEach((delivery) => {
      delivery.products.forEach((product) => {
        map.set(product.productCode, (map.get(product.productCode) ?? 0) + Number(product.quantity || 0))
      })
    })
    return map
  }, [filteredDeliveries])

  const totals = useMemo(() => {
    const deliveredUnits = filteredDeliveries.reduce((acc, item) => acc + item.totalUnits, 0)
    const generalStock = productStocks.reduce((acc, item) => acc + Number(item.stockQuantity || 0), 0)
    const sectorStock =
      sectorFilter === 'TODOS'
        ? productStocks.reduce((acc, item) => acc + Number(item.sectorStockQuantity || 0), 0)
        : productStocks.reduce((acc, item) => {
            const sectorItem = item.sectorStocks.find((sector) => sector.sectorId === sectorFilter)
            return acc + Number(sectorItem?.stockQuantity || 0)
          }, 0)

    const availableStock = sectorStock
    const progress = availableStock > 0 ? (deliveredUnits / availableStock) * 100 : 0
    const criticalProducts = productStocks.filter((item) => !item.sufficientForBeneficiaries).length

    return {
      deliveredUnits,
      generalStock,
      sectorStock,
      availableStock,
      progress,
      criticalProducts,
    }
  }, [filteredDeliveries, productStocks, sectorFilter])

  const stockBySectorRows = useMemo(() => {
    const rows = sectorOptions.map((sector) => {
      const stock = productStocks.reduce((acc, product) => {
        const sectorStock = product.sectorStocks.find((item) => item.sectorId === sector.id)
        return acc + Number(sectorStock?.stockQuantity || 0)
      }, 0)
      const delivered = filteredDeliveries
        .filter((delivery) => delivery.sectorId === sector.id)
        .reduce((acc, delivery) => acc + delivery.totalUnits, 0)

      return {
        ...sector,
        stock,
        delivered,
        balance: stock - delivered,
      }
    })

    return rows.filter((row) => sectorFilter === 'TODOS' || row.id === sectorFilter)
  }, [sectorOptions, productStocks, filteredDeliveries, sectorFilter])

  const sectorRows = useMemo(() => {
    return stockBySectorRows
      .map((row) => {
        const percent = clampPercent(row.stock > 0 ? (row.delivered / row.stock) * 100 : 0)
        return {
          name: row.name,
          units: row.delivered,
          assignedUnits: row.stock,
          percent,
          pendingPercent: 100 - percent,
        }
      })
      .sort((a, b) => b.assignedUnits - a.assignedUnits)
  }, [stockBySectorRows])

  const gerenciaRows = useMemo(() => {
    const deliveredByGerencia = new Map<string, number>()
    filteredDeliveries.forEach((row) => {
      const key = row.gerencia || '-'
      deliveredByGerencia.set(key, (deliveredByGerencia.get(key) ?? 0) + row.totalUnits)
    })

    const workersBySectorGerencia = new Map<string, Map<string, number>>()
    filteredWorkers.forEach((worker) => {
      const sectorId = worker.sectorId || '-'
      const gerencia = worker.gerencia || '-'
      const current = workersBySectorGerencia.get(sectorId) ?? new Map<string, number>()
      current.set(gerencia, (current.get(gerencia) ?? 0) + 1)
      workersBySectorGerencia.set(sectorId, current)
    })

    const assignedByGerencia = new Map<string, number>()
    stockBySectorRows.forEach((sectorRow) => {
      const gerenciasInSector = workersBySectorGerencia.get(sectorRow.id)
      if (!gerenciasInSector || gerenciasInSector.size === 0) return
      const totalWorkersInSector = Array.from(gerenciasInSector.values()).reduce((acc, value) => acc + value, 0)
      if (totalWorkersInSector <= 0) return

      gerenciasInSector.forEach((count, gerencia) => {
        const ratio = count / totalWorkersInSector
        assignedByGerencia.set(gerencia, (assignedByGerencia.get(gerencia) ?? 0) + sectorRow.stock * ratio)
      })
    })

    const keys = new Set<string>([
      ...Array.from(assignedByGerencia.keys()),
      ...Array.from(deliveredByGerencia.keys()),
    ])

    return Array.from(keys)
      .map((name) => {
        const units = deliveredByGerencia.get(name) ?? 0
        const assignedUnits = assignedByGerencia.get(name) ?? 0
        const percent = clampPercent(assignedUnits > 0 ? (units / assignedUnits) * 100 : 0)
        return {
          name,
          units,
          assignedUnits,
          percent,
          pendingPercent: 100 - percent,
        }
      })
      .sort((a, b) => b.assignedUnits - a.assignedUnits)
  }, [filteredDeliveries, filteredWorkers, stockBySectorRows])

  const progressChartData = useMemo(() => {
    const delivered = Math.max(Number(totals.deliveredUnits || 0), 0)
    const pending = Math.max(Number(totals.availableStock || 0) - delivered, 0)

    if (delivered <= 0 && pending <= 0) {
      return []
    }

    return [
      { name: 'Entregado', value: delivered, fill: CHART_COLORS.delivered },
      { name: 'Pendiente', value: pending, fill: CHART_COLORS.pending },
    ]
  }, [totals.deliveredUnits, totals.availableStock])

  const sectorChartRows = useMemo(() => {
    return sectorRows.map((row) => ({
      name: row.name,
      entregado: clampPercent(row.percent),
      pendiente: clampPercent(row.pendingPercent),
    }))
  }, [sectorRows])

  const gerenciaChartRows = useMemo(() => {
    return gerenciaRows.map((row) => ({
      name: row.name,
      entregado: clampPercent(row.percent),
      pendiente: clampPercent(row.pendingPercent),
    }))
  }, [gerenciaRows])

  const productRows = useMemo(() => {
    return productStocks
      .map((product) => {
        const sectorStock =
          sectorFilter === 'TODOS'
            ? Number(product.sectorStockQuantity || 0)
            : Number(product.sectorStocks.find((item) => item.sectorId === sectorFilter)?.stockQuantity || 0)
        const delivered = Number(deliveredByProduct.get(product.productCode) || 0)
        const baseStock = sectorFilter === 'TODOS' ? Number(product.stockQuantity || 0) : sectorStock
        const available = baseStock - delivered

        return {
          productCode: product.productCode,
          productName: product.productName,
          generalStock: Number(product.stockQuantity || 0),
          sectorStock,
          delivered,
          available,
          isCritical: !product.sufficientForBeneficiaries || available <= 0,
        }
      })
      .sort((a, b) => Number(b.isCritical) - Number(a.isCritical) || a.productName.localeCompare(b.productName, 'es'))
  }, [productStocks, deliveredByProduct, sectorFilter])

  const rangeActiveNow = useMemo(() => {
    if (!deliveryWindow?.enabled) return true
    if (!deliveryWindow.startAt || !deliveryWindow.endAt) return true
    if (nowMs <= 0) return true
    return nowMs >= deliveryWindow.startAt && nowMs <= deliveryWindow.endAt
  }, [deliveryWindow, nowMs])

  if (loading) {
    return <Loader label="Cargando dashboard..." />
  }

  return (
    <section className="space-y-5">
      <PageHeader
        title="Dashboard general"
        meta={
          <>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {selectedEvent?.name || selectedEventId || 'Sin evento'}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                rangeActiveNow ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {rangeActiveNow ? 'Evento Activo' : 'Evento Inactivo'}
            </span>
          </>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div
          className={`grid gap-3 ${
            datePreset === 'PERSONALIZADO'
              ? 'md:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_minmax(170px,1fr)_minmax(160px,0.9fr)_minmax(130px,0.75fr)_minmax(130px,0.75fr)_minmax(140px,0.75fr)]'
              : 'md:grid-cols-4'
          }`}
        >
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Sede</span>
            <select
              value={sectorFilter}
              onChange={(event) => setSectorFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="TODOS">Todas</option>
              {sectorOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gerencia</span>
            <select
              value={gerenciaFilter}
              onChange={(event) => setGerenciaFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="TODOS">Todas</option>
              {gerenciaOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha</span>
            <select
              value={datePreset}
              onChange={(event) => updateDateFilter({ preset: event.target.value as DatePreset })}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="HOY">Hoy</option>
              <option value="ULTIMOS_7_DIAS">Ultimos 7 dias</option>
              <option value="PERSONALIZADO">Personalizado</option>
            </select>
          </label>

          {datePreset === 'PERSONALIZADO' ? (
            <>
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Desde</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => updateDateFilter({ customStartDate: event.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Hasta</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(event) => updateDateFilter({ customEndDate: event.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Beneficiarios</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{formatNumber(filteredWorkers.length)}</p>
          </div>
        </div>
      </div>

      {hasInvalidCustomDateRange ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Rango personalizado invalido. Selecciona fechas validas.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard
          title="Avance general"
          value={formatPercent(totals.progress)}
          helper={`${formatNumber(totals.deliveredUnits)} de ${formatNumber(totals.availableStock)} unidades`}
          tone={totals.progress >= 80 ? 'success' : 'default'}
        />
        <KpiCard title="Stock general" value={formatNumber(totals.generalStock)} helper="Registrado en kits" />
        <KpiCard
          title="Asignado a sedes"
          value={formatNumber(totals.sectorStock)}
          helper={
            stockBySectorRows.length === 0 ? (
              'Sin asignacion'
            ) : (
              <div className="space-y-1">
                {stockBySectorRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{row.name}</span>
                    <span className="font-semibold text-slate-700">{formatNumber(row.stock)}</span>
                  </div>
                ))}
              </div>
            )
          }
        />
        <KpiCard title="Entregado" value={formatNumber(totals.deliveredUnits)} helper="Unidades filtradas" tone="success" />
        <KpiCard
          title="Criticos"
          value={formatNumber(totals.criticalProducts)}
          helper="Productos sin cobertura"
          tone={totals.criticalProducts > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Avance entregado vs pendiente">
          {progressChartData.length === 0 ? (
            <ChartEmpty />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={progressChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={86}
                    paddingAngle={3}
                  >
                    {progressChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatNumber(Number(value ?? 0))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="% de entregas por sector">
          {sectorChartRows.length === 0 ? (
            <ChartEmpty />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorChartRows} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <YAxis type="category" dataKey="name" width={92} />
                  <Tooltip formatter={(value) => `${Number(value ?? 0).toFixed(1)}%`} />
                  <Legend />
                  <Bar dataKey="entregado" stackId="pct" fill={CHART_COLORS.sector} name="Entregado" />
                  <Bar dataKey="pendiente" stackId="pct" fill={CHART_COLORS.pending} name="Pendiente" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="% de entregas por gerencia">
          {gerenciaChartRows.length === 0 ? (
            <ChartEmpty />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gerenciaChartRows} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <YAxis type="category" dataKey="name" width={92} />
                  <Tooltip formatter={(value) => `${Number(value ?? 0).toFixed(1)}%`} />
                  <Legend />
                  <Bar dataKey="entregado" stackId="pct" fill={CHART_COLORS.gerencia} name="Entregado" />
                  <Bar dataKey="pendiente" stackId="pct" fill={CHART_COLORS.pending} name="Pendiente" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Stock por producto">
          {productRows.length === 0 ? (
            <EmptyState title="Sin productos" description="No hay productos registrados para el evento." />
          ) : (
            <div className="space-y-2 md:hidden">
              {productRows.map((row) => (
                <article key={`${row.productCode}_card`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{row.productName}</p>
                  <p className="text-xs text-slate-500">{row.productCode}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">General</p>
                      <p className="font-semibold text-slate-700">{formatNumber(row.generalStock)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">Sede</p>
                      <p className="font-semibold text-slate-700">{formatNumber(row.sectorStock)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">Entregado</p>
                      <p className="font-semibold text-slate-700">{formatNumber(row.delivered)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">Saldo</p>
                      <p className={`font-semibold ${row.available <= 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                        {formatNumber(row.available)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                      row.isCritical ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {row.isCritical ? 'Revisar' : 'OK'}
                  </span>
                </article>
              ))}
            </div>
          )}
          {productRows.length > 0 ? (
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 font-semibold">Producto</th>
                    <th className="pb-2 font-semibold">General</th>
                    <th className="pb-2 font-semibold">Sede</th>
                    <th className="pb-2 font-semibold">Entregado</th>
                    <th className="pb-2 font-semibold">Saldo</th>
                    <th className="pb-2 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productRows.map((row) => (
                    <tr key={row.productCode}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900">{row.productName}</p>
                        <p className="text-xs text-slate-500">{row.productCode}</p>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{formatNumber(row.generalStock)}</td>
                      <td className="py-3 pr-4 text-slate-700">{formatNumber(row.sectorStock)}</td>
                      <td className="py-3 pr-4 text-slate-700">{formatNumber(row.delivered)}</td>
                      <td className={`py-3 pr-4 font-semibold ${row.available <= 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                        {formatNumber(row.available)}
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.isCritical ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {row.isCritical ? 'Revisar' : 'OK'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>

        <div className="space-y-4">
          <Panel title="Stock por sede">
            <div className="space-y-3">
              {stockBySectorRows.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">{row.name}</p>
                    <p className="text-sm font-semibold text-slate-700">{formatNumber(row.balance)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Stock {formatNumber(row.stock)} · Consumo {formatNumber(row.delivered)}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  )
}
