import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { Loader } from '../components/Loader'
import { PageHeader } from '../components/PageHeader'
import { useRealtimeData } from '../hooks/useRealtimeData'
import { deleteDeliveryRecord } from '../services/realtimeActions'
import { backendBase } from '../services/backend'
import type { DeliveryHistoryRow } from '../types/models'
import { downloadSheet } from '../utils/excel'
import { formatDateTime } from '../utils/format'

type ProductFilter = 'TODOS' | string
type UserFilter = 'TODOS' | string
type SectorFilter = 'TODOS' | string
type GerenciaFilter = 'TODOS' | string
type DatePreset = 'EVENTO' | 'HOY' | 'ULTIMOS_7_DIAS' | 'PERSONALIZADO'

interface DeliveryViewRow extends DeliveryHistoryRow {
  totalUnits: number
  sectorIdResolved: string
  sectorLabel: string
  gerencia: string
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
  eventStartDate: string,
  eventEndDate: string,
): { start: number | null; end: number | null } {
  const now = new Date()
  if (preset === 'EVENTO') {
    if (!eventStartDate || !eventEndDate) return { start: null, end: null }
    const startDate = new Date(`${eventStartDate}T00:00:00`)
    const endDate = new Date(`${eventEndDate}T23:59:59.999`)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { start: null, end: null }
    }
    return { start: startDate.getTime(), end: endDate.getTime() }
  }
  if (preset === 'HOY') {
    const bounds = toDayBounds(now)
    return { start: bounds.start, end: bounds.end }
  }
  if (preset === 'ULTIMOS_7_DIAS') {
    const end = toDayBounds(now).end
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 6)
    const start = toDayBounds(startDate).start
    return { start, end }
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

function resolvePhotoUrl(rawPath: string): string {
  const value = rawPath.trim()
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('/')) return `${backendBase}${value}`
  return `${backendBase}/${value}`
}

async function exportRowsToXlsx(rows: DeliveryHistoryRow[]) {
  await downloadSheet(
    [
      [
        { value: 'ID', fontWeight: 'bold' },
        { value: 'DNI', fontWeight: 'bold' },
        { value: 'Beneficiario', fontWeight: 'bold' },
        { value: 'Productos', fontWeight: 'bold' },
        { value: 'Kits', fontWeight: 'bold' },
        { value: 'Usuario email', fontWeight: 'bold' },
        { value: 'Usuario nombre', fontWeight: 'bold' },
        { value: 'PDA', fontWeight: 'bold' },
        { value: 'Foto URL', fontWeight: 'bold' },
        { value: 'Fecha', fontWeight: 'bold' },
        { value: 'Evento', fontWeight: 'bold' },
        { value: 'Sector', fontWeight: 'bold' },
      ],
      ...rows.map((row) => [
        row.id,
        row.workerDni,
        row.workerName,
        row.productSummary,
        row.kitNames.join(' | '),
        row.deliveredBy,
        row.deliveredByName,
        row.pdaId,
        row.photoPath,
        formatDateTime(row.timestamp),
        row.eventId,
        row.sectorId,
      ]),
    ],
    `entregas_${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.xlsx`,
    {
      sheet: 'Entregas',
      columns: [
        { width: 40 },
        { width: 14 },
        { width: 36 },
        { width: 48 },
        { width: 32 },
        { width: 28 },
        { width: 28 },
        { width: 18 },
        { width: 42 },
        { width: 20 },
        { width: 28 },
        { width: 18 },
      ],
    },
  )
}

export function EntregasPage() {
  const { workers, kits, deliveries, users, eventSectors, productStocks, events, selectedEventId, loading, error } = useRealtimeData()

  const [query, setQuery] = useState('')
  const [productFilter, setProductFilter] = useState<ProductFilter>('TODOS')
  const [userFilter, setUserFilter] = useState<UserFilter>('TODOS')
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>('TODOS')
  const [gerenciaFilter, setGerenciaFilter] = useState<GerenciaFilter>('TODOS')
  const [datePreset, setDatePreset] = useState<DatePreset>('EVENTO')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [sectorSummaryId, setSectorSummaryId] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventSectors.length) {
      setSectorSummaryId('')
      return
    }
    if (!eventSectors.some((sector) => sector.id === sectorSummaryId)) {
      setSectorSummaryId(eventSectors[0].id)
    }
  }, [eventSectors, sectorSummaryId])

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  )

  const productOptions = useMemo(() => {
    const map = new Map<string, string>()
    kits.forEach((kit) => {
      kit.products.forEach((product) => {
        if (!map.has(product.id)) {
          map.set(product.id, product.name)
        }
      })
    })
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [kits])

  const selectedDateRange = useMemo(
    () =>
      toDateRange(
        datePreset,
        customStartDate,
        customEndDate,
        selectedEvent?.startDate || '',
        selectedEvent?.endDate || '',
      ),
    [datePreset, customStartDate, customEndDate, selectedEvent?.startDate, selectedEvent?.endDate],
  )
  const hasInvalidCustomDateRange =
    datePreset === 'PERSONALIZADO' &&
    (!customStartDate || !customEndDate || selectedDateRange.start == null || selectedDateRange.end == null)

  const sectorNameById = useMemo(() => {
    return new Map(eventSectors.map((sector) => [sector.id, sector.name]))
  }, [eventSectors])

  const filteredEvents = useMemo<DeliveryViewRow[]>(() => {
    const workerMap = new Map(workers.map((worker) => [worker.dni, worker.nombreCompleto]))
    const workerInfoMap = new Map(
      workers.map((worker) => [
        worker.dni,
        {
          sectorId: worker.sectorId,
          sectorNombre: worker.sectorNombre || worker.sectorId || '-',
          gerencia: worker.gerencia || '-',
        },
      ]),
    )
    const kitMap = new Map(kits.map((kit) => [kit.id, kit.name]))
    const userMap = new Map(users.map((user) => [user.email.toLowerCase(), user.fullName]))

    const normalized = query.trim().toLowerCase()
    const { start, end } = selectedDateRange

    return deliveries
      .map((delivery) => {
        const workerName = workerMap.get(delivery.workerDni) ?? 'Sin nombre'
        const workerInfo = workerInfoMap.get(delivery.workerDni)
        const kitNames = delivery.kitIds.map((kitId) => kitMap.get(kitId) ?? kitId)
        const deliveredBy = delivery.userEmail || 'sin_usuario'
        const groupedProducts = delivery.products.reduce<Record<string, { name: string; qty: number }>>((acc, item) => {
          const key = `${item.kitCode || ''}::${item.productCode}`
          const current = acc[key] ?? { name: item.productName, qty: 0 }
          acc[key] = {
            name: current.name || item.productName,
            qty: current.qty + Number(item.quantity || 0),
          }
          return acc
        }, {})
        const productSummary = Object.values(groupedProducts)
          .map((item) => `${item.name} x${item.qty}`)
          .join(' | ')
        const totalUnits = delivery.products.reduce((acc, item) => acc + Number(item.quantity || 0), 0)
        const sectorId = workerInfo?.sectorId || delivery.sectorId || '-'
        const sectorLabel = workerInfo?.sectorNombre || sectorNameById.get(sectorId) || sectorId
        const gerencia = workerInfo?.gerencia || '-'

        return {
          id: delivery.id,
          workerDni: delivery.workerDni,
          workerName,
          deliveredBy,
          deliveredByName: userMap.get(deliveredBy.toLowerCase()) ?? deliveredBy,
          pdaId: delivery.pdaId || '-',
          photoPath: delivery.photoPath || '',
          timestamp: delivery.timestamp,
          kitIds: delivery.kitIds,
          kitNames,
          products: delivery.products,
          productSummary,
          eventId: delivery.eventId,
          sectorId: delivery.sectorId,
          totalUnits,
          sectorIdResolved: sectorId,
          sectorLabel,
          gerencia,
        } satisfies DeliveryViewRow
      })
      .filter((row) => {
        const inDateRange = hasInvalidCustomDateRange
          ? false
          : (start == null || end == null ? true : row.timestamp >= start && row.timestamp <= end)
        const matchesQuery =
          normalized.length === 0 ||
          row.workerDni.toLowerCase().includes(normalized) ||
          row.workerName.toLowerCase().includes(normalized) ||
          row.deliveredBy.toLowerCase().includes(normalized) ||
          row.deliveredByName.toLowerCase().includes(normalized) ||
          row.productSummary.toLowerCase().includes(normalized) ||
          row.kitNames.join(' ').toLowerCase().includes(normalized) ||
          row.sectorLabel.toLowerCase().includes(normalized) ||
          row.gerencia.toLowerCase().includes(normalized)

        const matchesProduct =
          productFilter === 'TODOS' || row.products.some((item) => item.productCode === productFilter)
        const matchesUser = userFilter === 'TODOS' || row.deliveredBy === userFilter
        const matchesSector = sectorFilter === 'TODOS' || row.sectorIdResolved === sectorFilter
        const matchesGerencia = gerenciaFilter === 'TODOS' || row.gerencia === gerenciaFilter

        return inDateRange && matchesQuery && matchesProduct && matchesUser && matchesSector && matchesGerencia
      })
      .sort((left, right) => right.timestamp - left.timestamp)
  }, [
    workers,
    kits,
    deliveries,
    users,
    sectorNameById,
    query,
    productFilter,
    userFilter,
    sectorFilter,
    gerenciaFilter,
    selectedDateRange,
    hasInvalidCustomDateRange,
  ])

  const groupedCount = useMemo(() => new Set(filteredEvents.map((row) => row.workerDni)).size, [filteredEvents])

  const userFilterOptions = useMemo(() => {
    return Array.from(new Set(deliveries.map((item) => item.userEmail).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'es'),
    )
  }, [deliveries])

  const gerenciaOptions = useMemo(() => {
    return Array.from(new Set(workers.map((worker) => worker.gerencia).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'es'),
    )
  }, [workers])

  const sectorSummary = useMemo(() => {
    if (!sectorSummaryId) {
      return {
        assignedTotal: 0,
        consumedTotal: 0,
        balanceTotal: 0,
        items: [] as Array<{
          productCode: string
          productName: string
          generalStock: number
          assignedStock: number
          consumedQuantity: number
          balanceQuantity: number
        }>,
      }
    }

    const consumedByProduct = new Map<string, { quantity: number; name: string }>()
    deliveries
      .filter((delivery) => delivery.sectorId === sectorSummaryId)
      .forEach((delivery) => {
        delivery.products.forEach((product) => {
          const current = consumedByProduct.get(product.productCode) ?? { quantity: 0, name: product.productName }
          consumedByProduct.set(product.productCode, {
            quantity: current.quantity + Number(product.quantity || 0),
            name: current.name || product.productName,
          })
        })
      })

    const items = productStocks.map((stock) => {
      const assigned = Number(stock.sectorStocks.find((entry) => entry.sectorId === sectorSummaryId)?.stockQuantity ?? 0)
      const consumed = Number(consumedByProduct.get(stock.productCode)?.quantity ?? 0)
      consumedByProduct.delete(stock.productCode)
      return {
        productCode: stock.productCode,
        productName: stock.productName,
        generalStock: Number(stock.stockQuantity || 0),
        assignedStock: assigned,
        consumedQuantity: consumed,
        balanceQuantity: assigned - consumed,
      }
    })

    consumedByProduct.forEach((value, code) => {
      items.push({
        productCode: code,
        productName: value.name || code,
        generalStock: 0,
        assignedStock: 0,
        consumedQuantity: value.quantity,
        balanceQuantity: -value.quantity,
      })
    })

    const sorted = items.sort((a, b) => a.productName.localeCompare(b.productName, 'es'))
    return {
      assignedTotal: sorted.reduce((acc, item) => acc + item.assignedStock, 0),
      consumedTotal: sorted.reduce((acc, item) => acc + item.consumedQuantity, 0),
      balanceTotal: sorted.reduce((acc, item) => acc + item.balanceQuantity, 0),
      items: sorted,
    }
  }, [deliveries, productStocks, sectorSummaryId])

  const deliveryIndicators = useMemo(() => {
    const totalDeliveredUnits = filteredEvents.reduce((acc, row) => acc + row.totalUnits, 0)
    const totalStockGeneral = productStocks.reduce((acc, stock) => acc + Number(stock.stockQuantity || 0), 0)
    const totalStockBySelectedSector = sectorFilter === 'TODOS'
      ? productStocks.reduce((acc, stock) => acc + Number(stock.sectorStockQuantity || 0), 0)
      : productStocks.reduce((acc, stock) => {
          const sectorStock = stock.sectorStocks.find((entry) => entry.sectorId === sectorFilter)
          return acc + Number(sectorStock?.stockQuantity || 0)
        }, 0)
    const denominator = sectorFilter === 'TODOS' ? totalStockGeneral : totalStockBySelectedSector
    const generalProgress = denominator > 0 ? (totalDeliveredUnits / denominator) * 100 : 0

    const bySectorMap = new Map<string, number>()
    filteredEvents.forEach((row) => {
      bySectorMap.set(row.sectorLabel, (bySectorMap.get(row.sectorLabel) ?? 0) + row.totalUnits)
    })
    const bySector = Array.from(bySectorMap.entries())
      .map(([name, units]) => ({
        name,
        units,
        percent: totalDeliveredUnits > 0 ? (units / totalDeliveredUnits) * 100 : 0,
      }))
      .sort((a, b) => b.units - a.units)

    const byGerenciaMap = new Map<string, number>()
    filteredEvents.forEach((row) => {
      byGerenciaMap.set(row.gerencia || '-', (byGerenciaMap.get(row.gerencia || '-') ?? 0) + row.totalUnits)
    })
    const byGerencia = Array.from(byGerenciaMap.entries())
      .map(([name, units]) => ({
        name,
        units,
        percent: totalDeliveredUnits > 0 ? (units / totalDeliveredUnits) * 100 : 0,
      }))
      .sort((a, b) => b.units - a.units)

    return {
      totalDeliveredUnits,
      totalStockGeneral,
      totalStockBySelectedSector,
      generalProgress,
      bySector,
      byGerencia,
    }
  }, [filteredEvents, productStocks, sectorFilter])
  void deliveryIndicators

  const stockBySector = useMemo(() => {
    const totals = new Map<string, number>()
    eventSectors.forEach((sector) => totals.set(sector.name, 0))
    productStocks.forEach((product) => {
      product.sectorStocks.forEach((sector) => {
        const sectorName = eventSectors.find((item) => item.id === sector.sectorId)?.name || sector.sectorName || sector.sectorId
        totals.set(sectorName, (totals.get(sectorName) ?? 0) + Number(sector.stockQuantity || 0))
      })
    })
    return Array.from(totals.entries())
      .map(([name, stock]) => ({ name, stock }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [eventSectors, productStocks])
  void stockBySector

  async function handleDeleteDelivery(row: DeliveryHistoryRow) {
    setActionError(null)
    setActionMessage(null)

    const confirmed = window.confirm(`Eliminar entrega ${row.id}?`)
    if (!confirmed) return

    try {
      setDeletingId(row.id)
      await deleteDeliveryRecord(row.id)
      setActionMessage(`Entrega ${row.id} eliminada correctamente.`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo eliminar la entrega'
      setActionError(message)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <Loader label="Cargando historial de entregas..." />
  }

  return (
    <section className="space-y-4">
      <PageHeader title="Resumen de entregas" description="Trazabilidad por producto y evidencia de foto con URL." />

      <div className="relative space-y-3 rounded-2xl border border-slate-200 bg-white p-4 pl-5 shadow-sm before:absolute before:bottom-4 before:left-0 before:top-4 before:w-2 before:rounded-r-full before:bg-emerald-600 before:shadow-[0_0_10px_rgba(22,163,74,0.7)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Resumen stock/consumo por sector</p>
            <p className="text-xs text-slate-500">Asignado, consumido y saldo disponible con cantidades agrupadas por producto.</p>
          </div>
          {eventSectors.length > 1 ? (
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-600">Sector</span>
              <select
                value={sectorSummaryId}
                onChange={(event) => setSectorSummaryId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 sm:min-w-[220px] sm:w-auto"
              >
                {eventSectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {eventSectors[0]?.name ?? 'Sin sector'}
            </span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs text-emerald-700">Stock asignado</p>
            <p className="text-xl font-bold text-emerald-800">{sectorSummary.assignedTotal}</p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
            <p className="text-xs text-indigo-700">Consumo entregado</p>
            <p className="text-xl font-bold text-indigo-800">{sectorSummary.consumedTotal}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Saldo disponible</p>
            <p className="text-xl font-bold text-amber-800">{sectorSummary.balanceTotal}</p>
          </div>
        </div>

        {sectorSummary.items.length > 0 ? (
          <div className="space-y-2 md:hidden">
            {sectorSummary.items.map((item) => (
              <article key={`${item.productCode}_${sectorSummaryId}_card`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{item.productName}</p>
                <p className="text-xs text-slate-500">{item.productCode}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="text-slate-500">Stock general</p>
                    <p className="font-semibold text-slate-700">{item.generalStock}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="text-slate-500">Asignado</p>
                    <p className="font-semibold text-slate-700">{item.assignedStock}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="text-slate-500">Consumido</p>
                    <p className="font-semibold text-slate-700">{item.consumedQuantity}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="text-slate-500">Saldo</p>
                    <p className={`font-semibold ${item.balanceQuantity < 0 ? 'text-red-700' : 'text-slate-700'}`}>
                      {item.balanceQuantity}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {sectorSummary.items.length > 0 ? (
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Producto</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Stock general</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Asignado</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Consumido</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sectorSummary.items.map((item) => (
                  <tr key={`${item.productCode}_${sectorSummaryId}`}>
                    <td className="px-3 py-2 text-slate-700">{item.productName}</td>
                    <td className="px-3 py-2 text-slate-600">{item.generalStock}</td>
                    <td className="px-3 py-2 text-slate-600">{item.assignedStock}</td>
                    <td className="px-3 py-2 text-slate-600">{item.consumedQuantity}</td>
                    <td className={`px-3 py-2 ${item.balanceQuantity < 0 ? 'text-red-700' : 'text-slate-700'}`}>{item.balanceQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {actionMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{actionMessage}</div>
      ) : null}

      <div className="relative grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 pl-5 shadow-sm before:absolute before:bottom-4 before:left-0 before:top-4 before:w-2 before:rounded-r-full before:bg-emerald-600 before:shadow-[0_0_10px_rgba(22,163,74,0.7)] md:grid-cols-12">
        <label className="md:col-span-4">
          <span className="mb-1 block text-sm font-medium text-slate-700">Buscar</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="DNI, nombre, usuario o producto"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">Producto</span>
          <select
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="TODOS">Todos</option>
            {productOptions.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">Usuario</span>
          <select
            value={userFilter}
            onChange={(event) => setUserFilter(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="TODOS">Todos</option>
            {userFilterOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">Sede</span>
          <select
            value={sectorFilter}
            onChange={(event) => setSectorFilter(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="TODOS">Todas</option>
            {eventSectors.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.name}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">Gerencia</span>
          <select
            value={gerenciaFilter}
            onChange={(event) => setGerenciaFilter(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="TODOS">Todas</option>
            {gerenciaOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">Rango fecha</span>
          <select
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value as DatePreset)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="EVENTO">Rango del evento (predeterminado)</option>
            <option value="HOY">Hoy</option>
            <option value="ULTIMOS_7_DIAS">Ultimos 7 dias</option>
            <option value="PERSONALIZADO">Rango personalizado</option>
          </select>
        </label>

        {datePreset === 'PERSONALIZADO' ? (
          <>
            <label className="md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">Desde</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </label>
            <label className="md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">Hasta</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </label>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => void exportRowsToXlsx(filteredEvents)}
          disabled={filteredEvents.length === 0}
          className="h-fit self-end rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
        >
          Exportar XLSX
        </button>
      </div>

      {hasInvalidCustomDateRange ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Rango personalizado invalido. Selecciona fechas validas (desde/hasta).
        </div>
      ) : null}

      <div className="relative rounded-xl border border-slate-200 bg-white px-4 py-3 pl-5 text-sm text-slate-600 shadow-sm before:absolute before:bottom-1 before:left-0 before:top-1 before:w-2 before:rounded-r-full before:bg-emerald-600 before:shadow-[0_0_10px_rgba(22,163,74,0.7)]">
        Grupos: <span className="font-semibold text-slate-900">{groupedCount}</span>
        {' '}| Entregas filtradas: <span className="font-semibold text-slate-900">{filteredEvents.length}</span>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="relative pt-4 before:absolute before:left-1 before:right-1 before:top-0 before:h-2 before:rounded-full before:bg-emerald-600 before:shadow-[0_0_10px_rgba(22,163,74,0.7)]">
          <EmptyState title="Sin entregas" description="No hay eventos para los filtros seleccionados." />
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white pt-4 shadow-sm before:absolute before:left-1 before:right-1 before:top-0 before:h-2 before:rounded-full before:bg-emerald-600 before:shadow-[0_0_10px_rgba(22,163,74,0.7)]">
          <div className="space-y-2 p-3 md:hidden">
            {filteredEvents.map((event) => {
              const photoUrl = resolvePhotoUrl(event.photoPath)
              return (
                <article key={`${event.id}_mobile`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{event.id}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{event.workerName}</p>
                  <p className="text-xs text-slate-600">DNI: {event.workerDni}</p>

                  <div className="mt-2 space-y-1 text-xs text-slate-700">
                    <p><span className="font-medium text-slate-900">Producto:</span> {event.productSummary || '-'}</p>
                    <p><span className="font-medium text-slate-900">Kits:</span> {event.kitNames.join(', ') || '-'}</p>
                    <p>
                      <span className="font-medium text-slate-900">Usuario:</span> {event.deliveredByName}
                      <span className="text-slate-500"> ({event.deliveredBy})</span>
                    </p>
                    <p><span className="font-medium text-slate-900">Sector:</span> {event.sectorLabel || event.sectorId || '-'}</p>
                    <p><span className="font-medium text-slate-900">Fecha y hora:</span> {formatDateTime(event.timestamp)}</p>
                    <p>
                      <span className="font-medium text-slate-900">Foto:</span>{' '}
                      {photoUrl ? (
                        <a href={photoUrl} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                          Pulsa para ver la imagen
                        </a>
                      ) : (
                        '-'
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteDelivery(event)}
                    disabled={deletingId === event.id}
                    aria-label="Eliminar entrega"
                    title="Eliminar entrega"
                    className="mt-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    {deletingId === event.id ? (
                      '...'
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M5 6l1 14h12l1-14" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    )}
                  </button>
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">ID entrega</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Nombre y apellido</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">DNI</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Producto</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Kits</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Usuario que entregó</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Enlace de foto</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Sector</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Fecha y hora</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((event) => {
                  const photoUrl = resolvePhotoUrl(event.photoPath)
                  return (
                    <tr key={event.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-xs text-slate-600">{event.id}</td>
                      <td className="px-4 py-2 text-slate-800">{event.workerName}</td>
                      <td className="px-4 py-2 text-slate-700">{event.workerDni}</td>
                      <td className="px-4 py-2 text-slate-700">{event.productSummary || '-'}</td>
                      <td className="px-4 py-2 text-slate-700">{event.kitNames.join(', ') || '-'}</td>
                      <td className="px-4 py-2 text-slate-600">
                        <p>{event.deliveredByName}</p>
                        <p className="text-xs text-slate-500">{event.deliveredBy}</p>
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {photoUrl ? (
                          <a href={photoUrl} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                            Pulsa para ver la imagen
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{event.sectorLabel || event.sectorId || '-'}</td>
                      <td className="px-4 py-2 text-slate-600">{formatDateTime(event.timestamp)}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteDelivery(event)}
                          disabled={deletingId === event.id}
                          aria-label="Eliminar entrega"
                          title="Eliminar entrega"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          {deletingId === event.id ? (
                            '...'
                          ) : (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M5 6l1 14h12l1-14" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
