import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { Loader } from '../components/Loader'
import { PageHeader } from '../components/PageHeader'
import { useRealtimeData } from '../hooks/useRealtimeData'
import { deleteWorkerAndDeliveries } from '../services/realtimeActions'
import { backendBase } from '../services/backend'
import { formatDateTime } from '../utils/format'

type StatusFilter = 'TODOS' | 'COMPLETO' | 'CON_PENDIENTES'
type KitFilter = 'TODOS' | string

interface WorkerProductStatusRow {
  kitId: string
  kitName: string
  productCode: string
  productName: string
  requiredQuantity: number
  deliveredQuantity: number
  pendingQuantity: number
  status: 'Completo' | 'Parcial' | 'Pendiente'
  deliveredBy: string
  deliveredByName: string
  pdaId: string
  photoPath: string
  deliveredAt: number
}

interface WorkerSummaryRow {
  dni: string
  nombreCompleto: string
  area: string
  gerencia: string
  sectorId: string
  sectorNombre: string
  hasDeliveries: boolean
  totalProducts: number
  completedProducts: number
  pendingProducts: number
  products: WorkerProductStatusRow[]
}

interface ProductDeliveryAccumulator {
  deliveredQuantity: number
  latestDelivery: {
    userEmail: string
    pdaId: string
    photoPath: string
    timestamp: number
  } | null
}
const PAGE_SIZE = 40

function resolvePhotoUrl(rawPath: string): string {
  const value = rawPath.trim()
  if (!value || value === '-') return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('/')) return `${backendBase}${value}`
  return `${backendBase}/${value}`
}

export function BeneficiariosPage() {
  const { workers, kits, deliveries, users, selectedEventId, loading, error } = useRealtimeData()

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS')
  const [kitFilter, setKitFilter] = useState<KitFilter>('TODOS')
  const [deletingDni, setDeletingDni] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const rows = useMemo<WorkerSummaryRow[]>(() => {
    const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user.fullName]))
    const deliveryByWorkerKitProduct = new Map<string, ProductDeliveryAccumulator>()

    deliveries.forEach((delivery) => {
      delivery.products.forEach((product) => {
        const key = `${delivery.workerDni}_${product.kitCode}_${product.productCode}`
        const current = deliveryByWorkerKitProduct.get(key)
        const deliveredQuantity = (current?.deliveredQuantity ?? 0) + Number(product.quantity || 0)
        const latestDelivery =
          !current?.latestDelivery || delivery.timestamp > current.latestDelivery.timestamp
            ? {
                userEmail: delivery.userEmail || '-',
                pdaId: delivery.pdaId || '-',
                photoPath: delivery.photoPath || '-',
                timestamp: delivery.timestamp,
              }
            : current.latestDelivery

        deliveryByWorkerKitProduct.set(key, {
          deliveredQuantity,
          latestDelivery,
        })
      })
    })

    const normalizedQuery = query.trim().toLowerCase()

    return workers
      .map((worker) => {
        const products = kits
          .filter((kit) => kitFilter === 'TODOS' || kit.id === kitFilter)
          .flatMap((kit) => {
            const sourceProducts =
              kit.products.length > 0
                ? kit.products
                : [{ id: kit.id, name: kit.name, quantity: 1 }]

            return sourceProducts.map((product) => {
              const key = `${worker.dni}_${kit.id}_${product.id}`
              const acc = deliveryByWorkerKitProduct.get(key)
              const deliveredQuantity = Number(acc?.deliveredQuantity ?? 0)
              const requiredQuantity = Number(product.quantity || 0)
              const pendingQuantity = Math.max(requiredQuantity - deliveredQuantity, 0)

              const status: WorkerProductStatusRow['status'] =
                deliveredQuantity <= 0.000001
                  ? 'Pendiente'
                  : deliveredQuantity + 0.000001 < requiredQuantity
                    ? 'Parcial'
                    : 'Completo'

              const deliveredBy = acc?.latestDelivery?.userEmail || '-'
              const deliveredByName = userByEmail.get(deliveredBy.toLowerCase()) || deliveredBy

              return {
                kitId: kit.id,
                kitName: kit.name,
                productCode: product.id,
                productName: product.name,
                requiredQuantity,
                deliveredQuantity,
                pendingQuantity,
                status,
                deliveredBy,
                deliveredByName,
                pdaId: acc?.latestDelivery?.pdaId || '-',
                photoPath: acc?.latestDelivery?.photoPath || '-',
                deliveredAt: acc?.latestDelivery?.timestamp || 0,
              } satisfies WorkerProductStatusRow
            })
          })

        const completedProducts = products.filter((item) => item.status === 'Completo').length
        const pendingProducts = products.filter((item) => item.status !== 'Completo').length

        return {
          dni: worker.dni,
          nombreCompleto: worker.nombreCompleto,
          area: worker.area,
          gerencia: worker.gerencia,
          sectorId: worker.sectorId,
          sectorNombre: worker.sectorNombre,
          hasDeliveries: worker.hasDeliveries,
          totalProducts: products.length,
          completedProducts,
          pendingProducts,
          products,
        } satisfies WorkerSummaryRow
      })
      .filter((row) => {
        if (row.products.length === 0) return false

        const matchesQuery =
          normalizedQuery.length === 0 ||
          row.dni.toLowerCase().includes(normalizedQuery) ||
          row.nombreCompleto.toLowerCase().includes(normalizedQuery) ||
          row.products.some(
            (item) =>
              item.kitName.toLowerCase().includes(normalizedQuery) ||
              item.productName.toLowerCase().includes(normalizedQuery) ||
              item.productCode.toLowerCase().includes(normalizedQuery),
          )

        const matchesStatus =
          statusFilter === 'TODOS' ||
          (statusFilter === 'COMPLETO' && row.pendingProducts === 0) ||
          (statusFilter === 'CON_PENDIENTES' && row.pendingProducts > 0)

        return matchesQuery && matchesStatus
      })
      .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es'))
  }, [workers, kits, deliveries, users, query, statusFilter, kitFilter])

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, kitFilter, rows.length])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return rows.slice(start, start + PAGE_SIZE)
  }, [rows, currentPage])

  async function onDeleteWorker(dni: string, nombre: string, hasDeliveries: boolean) {
    setActionError(null)
    setActionMessage(null)

    if (hasDeliveries) {
      setActionError('No se puede eliminar: el beneficiario ya tiene entregas registradas en el evento.')
      return
    }

    const confirmed = window.confirm(
      `Eliminar beneficiario ${nombre} (${dni}) del evento actual?\n\nEste cambio se reflejara tambien en los PDA.`,
    )
    if (!confirmed) return

    try {
      setDeletingDni(dni)
      await deleteWorkerAndDeliveries(dni, selectedEventId)
      setActionMessage(`Beneficiario ${dni} eliminado correctamente.`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo eliminar el beneficiario'
      setActionError(message)
    } finally {
      setDeletingDni(null)
    }
  }

  if (loading) {
    return <Loader label="Cargando beneficiarios..." />
  }

  return (
    <section className="space-y-4">
      <PageHeader title="Beneficiarios" description="Seguimiento de entrega por producto: completo, parcial o pendiente." />

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {actionMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{actionMessage}</div>
      ) : null}

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">Buscar por DNI, nombre o producto</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="DNI, nombre o producto"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">Estado</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          >
            <option value="TODOS">Todos</option>
            <option value="COMPLETO">Completos</option>
            <option value="CON_PENDIENTES">Con pendientes</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">Kit</span>
          <select
            value={kitFilter}
            onChange={(event) => setKitFilter(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          >
            <option value="TODOS">Todos</option>
            {kits.map((kit) => (
              <option key={kit.id} value={kit.id}>
                {kit.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        Trabajadores mostrados: <span className="font-semibold text-slate-900">{pagedRows.length}</span> de{' '}
        <span className="font-semibold text-slate-900">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Sin resultados" description="No hay beneficiarios para los filtros aplicados." />
      ) : (
        <div className="space-y-3">
          <div className="space-y-3 md:hidden">
            {pagedRows.map((row) => (
              <article key={row.dni} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">{row.nombreCompleto}</p>
                    <p className="text-xs text-slate-500">
                      DNI: {row.dni} | {row.area || '-'} | {row.gerencia || '-'} | Sector: {row.sectorNombre || row.sectorId || '-'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Completos: {row.completedProducts}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Pendientes: {row.pendingProducts}
                      </span>
                      {row.hasDeliveries ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          Con entregas
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteWorker(row.dni, row.nombreCompleto, row.hasDeliveries)}
                    disabled={deletingDni === row.dni || row.hasDeliveries}
                    aria-label="Eliminar beneficiario"
                    title="Eliminar beneficiario"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    {deletingDni === row.dni ? (
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
                </div>

                <div className="divide-y divide-slate-200">
                  {row.products.map((product) => {
                    const photoUrl = resolvePhotoUrl(product.photoPath)
                    return (
                      <div key={`${row.dni}_${product.kitId}_${product.productCode}`} className="px-4 py-3 text-xs text-slate-700">
                        <div className="mb-2">
                          <p className="font-semibold text-slate-900">{product.productName}</p>
                          <p className="text-slate-500">{product.productCode}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          <p>Kit: <span className="text-slate-900">{product.kitName}</span></p>
                          <p>Req.: <span className="text-slate-900">{product.requiredQuantity}</span></p>
                          <p>Entregado: <span className="text-slate-900">{product.deliveredQuantity}</span></p>
                          <p>Pendiente: <span className="text-slate-900">{product.pendingQuantity}</span></p>
                          <p>Usuario: <span className="text-slate-900">{product.deliveredByName}</span></p>
                          <p>Dispositivo: <span className="text-slate-900">{product.pdaId}</span></p>
                          <p className="col-span-2">Fecha: <span className="text-slate-900">{product.deliveredAt > 0 ? formatDateTime(product.deliveredAt) : '-'}</span></p>
                          <p className="col-span-2">
                            Foto:{' '}
                            {photoUrl ? (
                              <a href={photoUrl} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                                Pulsa para ver la imagen
                              </a>
                            ) : (
                              '-'
                            )}
                          </p>
                        </div>
                        <div className="mt-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              product.status === 'Completo'
                                ? 'bg-emerald-100 text-emerald-700'
                                : product.status === 'Parcial'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {product.status}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden w-full max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
            <table className="min-w-[1380px] divide-y divide-slate-200 text-[11px] leading-tight xl:text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="min-w-[190px] px-3 py-2 text-left font-semibold text-slate-600">Nombre y apellido</th>
                  <th className="min-w-[82px] px-2 py-2 text-left font-semibold text-slate-600">DNI</th>
                  <th className="min-w-[160px] px-2 py-2 text-left font-semibold text-slate-600">Area / Gerencia</th>
                  <th className="min-w-[88px] px-2 py-2 text-left font-semibold text-slate-600">Sector</th>
                  <th className="min-w-[110px] px-2 py-2 text-left font-semibold text-slate-600">Kit</th>
                  <th className="min-w-[110px] px-2 py-2 text-left font-semibold text-slate-600">Producto</th>
                  <th className="min-w-[52px] px-2 py-2 text-left font-semibold text-slate-600">Req.</th>
                  <th className="min-w-[52px] px-2 py-2 text-left font-semibold text-slate-600">Ent.</th>
                  <th className="min-w-[56px] px-2 py-2 text-left font-semibold text-slate-600">Pend.</th>
                  <th className="min-w-[80px] px-2 py-2 text-left font-semibold text-slate-600">Estado</th>
                  <th className="min-w-[165px] px-2 py-2 text-left font-semibold text-slate-600">Usuario / dispositivo</th>
                  <th className="min-w-[112px] px-2 py-2 text-left font-semibold text-slate-600">Fecha</th>
                  <th className="min-w-[95px] px-2 py-2 text-left font-semibold text-slate-600">Foto</th>
                  <th className="min-w-[124px] px-2 py-2 text-left font-semibold text-slate-600">Resumen</th>
                  <th className="min-w-[54px] px-2 py-2 text-left font-semibold text-slate-600">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRows.flatMap((row) =>
                  row.products.map((product, index) => {
                    const rowKey = `${row.dni}_${product.kitId}_${product.productCode}`
                    const photoUrl = resolvePhotoUrl(product.photoPath)
                    const isFirstProduct = index === 0

                    return (
                      <tr key={rowKey} className="hover:bg-slate-50">
                        {isFirstProduct ? (
                          <>
                            <td rowSpan={row.products.length} className="px-3 py-2 align-top font-semibold text-slate-800">
                              {row.nombreCompleto}
                            </td>
                            <td rowSpan={row.products.length} className="whitespace-nowrap px-2 py-2 align-top text-slate-700">
                              {row.dni}
                            </td>
                            <td rowSpan={row.products.length} className="px-2 py-2 align-top text-slate-600">
                              <p>{row.area || '-'}</p>
                              <p className="text-[10px] text-slate-500 xl:text-[11px]">{row.gerencia || '-'}</p>
                            </td>
                            <td rowSpan={row.products.length} className="whitespace-nowrap px-2 py-2 align-top text-slate-600">
                              {row.sectorNombre || row.sectorId || '-'}
                            </td>
                          </>
                        ) : null}

                        <td className="px-2 py-2 text-slate-800">{product.kitName}</td>
                        <td className="px-2 py-2 text-slate-700">
                          <p className="whitespace-nowrap">{product.productName}</p>
                          <p className="text-[10px] text-slate-500 xl:text-[11px]">{product.productCode}</p>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-700">{product.requiredQuantity}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-700">{product.deliveredQuantity}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-700">{product.pendingQuantity}</td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold xl:text-[11px] ${
                              product.status === 'Completo'
                                ? 'bg-emerald-100 text-emerald-700'
                                : product.status === 'Parcial'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {product.status}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-slate-600">
                          <p>{product.deliveredByName}</p>
                          <p className="text-[10px] text-slate-500 xl:text-[11px]">{product.pdaId}</p>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-600">{product.deliveredAt > 0 ? formatDateTime(product.deliveredAt) : '-'}</td>
                        <td className="px-2 py-2 text-slate-600">
                          {photoUrl ? (
                            <a href={photoUrl} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                              Pulsa para ver la imagen
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>

                        {isFirstProduct ? (
                          <>
                            <td rowSpan={row.products.length} className="px-2 py-2 align-top">
                              <div className="flex flex-col gap-1 whitespace-nowrap">
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 xl:text-[11px]">
                                  Completos: {row.completedProducts}
                                </span>
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 xl:text-[11px]">
                                  Pendientes: {row.pendingProducts}
                                </span>
                                {row.hasDeliveries ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 xl:text-[11px]">
                                    Con entregas
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td rowSpan={row.products.length} className="px-2 py-2 align-top">
                              <button
                                type="button"
                                onClick={() => onDeleteWorker(row.dni, row.nombreCompleto, row.hasDeliveries)}
                                disabled={deletingDni === row.dni || row.hasDeliveries}
                                aria-label="Eliminar beneficiario"
                                title="Eliminar beneficiario"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                              >
                                {deletingDni === row.dni ? (
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
                          </>
                        ) : null}
                      </tr>
                    )
                  }),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage <= 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-slate-600">Pagina {currentPage} de {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </section>
  )
}
