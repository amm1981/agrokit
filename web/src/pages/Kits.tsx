import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { Loader } from '../components/Loader'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import { useRealtimeData } from '../hooks/useRealtimeData'
import { deleteKit, updateProductSectorStocks, updateProductStock, upsertKit } from '../services/realtimeActions'
import type { KitProduct } from '../types/models'

interface KitForm {
  id: string
  name: string
  products: KitProduct[]
}

const emptyForm: KitForm = {
  id: '',
  name: '',
  products: [{ id: '', name: '', quantity: 1 }],
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildEventAbbreviation(value: string): string {
  const cleaned = value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const words = cleaned
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)

  if (words.length >= 2) {
    return words.slice(0, 4).map((word) => word[0]).join('')
  }

  const single = words[0] || 'EVT'
  return single.slice(0, 4)
}

function buildProductCode(params: {
  eventAbbreviation: string
  kitId: string
  productName: string
  index: number
}): string {
  const eventCode = normalizeToken(params.eventAbbreviation) || 'EVT'
  const kitCode = normalizeToken(params.kitId).slice(0, 8) || 'KIT'
  const productCode = normalizeToken(params.productName).slice(0, 12) || `PRD${String(params.index + 1).padStart(2, '0')}`
  return `${eventCode}_${kitCode}_${productCode}`
}

export function KitsPage() {
  const { user } = useAuth()
  const { kits, selectedEventId, events, eventSectors, productStocks, loading, error } = useRealtimeData()

  const [form, setForm] = useState<KitForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showKitModal, setShowKitModal] = useState(false)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [stockQuery, setStockQuery] = useState('')
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({})
  const [sectorStockInputs, setSectorStockInputs] = useState<Record<string, Record<string, string>>>({})
  const [savingStockCode, setSavingStockCode] = useState<string | null>(null)
  const [savingSectorStockCode, setSavingSectorStockCode] = useState<string | null>(null)
  const [stockMessage, setStockMessage] = useState<string | null>(null)
  const [stockError, setStockError] = useState<string | null>(null)

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  )

  const eventAbbreviation = useMemo(() => {
    return buildEventAbbreviation(selectedEvent?.name || selectedEventId || 'EVT')
  }, [selectedEvent?.name, selectedEventId])

  useEffect(() => {
    const nextGeneral: Record<string, string> = {}
    const nextSector: Record<string, Record<string, string>> = {}

    productStocks.forEach((item) => {
      nextGeneral[item.productCode] = String(item.stockQuantity)

      const sectorMap: Record<string, string> = {}
      eventSectors.forEach((sector) => {
        const found = item.sectorStocks.find((entry) => entry.sectorId === sector.id)
        sectorMap[sector.id] = String(found?.stockQuantity ?? 0)
      })
      nextSector[item.productCode] = sectorMap
    })

    setStockInputs(nextGeneral)
    setSectorStockInputs(nextSector)
  }, [productStocks, eventSectors])

  const filteredKits = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return kits
    return kits.filter((kit) => kit.id.toLowerCase().includes(normalized) || kit.name.toLowerCase().includes(normalized))
  }, [kits, query])

  const filteredStocks = useMemo(() => {
    const normalized = stockQuery.trim().toLowerCase()
    if (!normalized) return productStocks
    return productStocks.filter(
      (item) =>
        item.productCode.toLowerCase().includes(normalized) ||
        item.productName.toLowerCase().includes(normalized),
    )
  }, [productStocks, stockQuery])

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  function closeModal() {
    setShowKitModal(false)
    resetForm()
  }

  function openCreateModal() {
    resetForm()
    setShowKitModal(true)
    setActionError(null)
    setActionMessage(null)
  }

  function resolveProductCode(product: KitProduct, index: number, currentForm: KitForm): string {
    const existing = product.id.trim()
    if (existing) return existing
    return buildProductCode({
      eventAbbreviation: eventAbbreviation,
      kitId: currentForm.id,
      productName: product.name,
      index,
    })
  }

  function updateProduct(index: number, patch: Partial<KitProduct>) {
    setForm((current) => {
      const products = current.products.map((product, productIndex) => {
        if (productIndex !== index) return product
        const merged = { ...product, ...patch }

        if (!merged.id.trim()) {
          merged.id = buildProductCode({
            eventAbbreviation,
            kitId: current.id,
            productName: merged.name,
            index,
          })
        }

        return merged
      })

      return {
        ...current,
        products,
      }
    })
  }

  function addProductRow() {
    setForm((current) => {
      const nextIndex = current.products.length
      const nextProductCode = buildProductCode({
        eventAbbreviation,
        kitId: current.id,
        productName: '',
        index: nextIndex,
      })
      return {
        ...current,
        products: [...current.products, { id: nextProductCode, name: '', quantity: 1 }],
      }
    })
  }

  function removeProductRow(index: number) {
    setForm((current) => ({
      ...current,
      products: current.products.filter((_, productIndex) => productIndex !== index),
    }))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)
    setActionMessage(null)

    const payload = {
      id: form.id.trim(),
      name: form.name.trim(),
      eventId: selectedEventId,
      products: form.products
        .map((product, index) => ({
          id: resolveProductCode(product, index, form),
          name: product.name.trim(),
          quantity: Number(product.quantity) > 0 ? Number(product.quantity) : 1,
        }))
        .filter((product) => product.id && product.name),
    }

    if (!payload.id || !payload.name) {
      setActionError('ID y nombre del kit son obligatorios')
      return
    }

    if (payload.products.length === 0) {
      setActionError('Debes registrar al menos un producto en el kit')
      return
    }

    try {
      setSaving(true)
      await upsertKit(payload, selectedEventId)
      setActionMessage(editingId ? 'Kit actualizado' : 'Kit creado')
      closeModal()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo guardar el kit'
      setActionError(message)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(kitId: string) {
    setActionError(null)
    setActionMessage(null)

    const confirmed = window.confirm(
      `Eliminar kit ${kitId} del evento actual?\n\nSi existen entregas antiguas, se conservaran y se mostrara el ID del kit.`,
    )
    if (!confirmed) return

    try {
      setDeletingId(kitId)
      await deleteKit(kitId, selectedEventId)
      setActionMessage('Kit eliminado')
      if (editingId === kitId) {
        closeModal()
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo eliminar el kit'
      setActionError(message)
    } finally {
      setDeletingId(null)
    }
  }

  async function onSaveGeneralStock(productCode: string) {
    setStockError(null)
    setStockMessage(null)

    const value = Number(stockInputs[productCode] ?? Number.NaN)
    if (!Number.isFinite(value) || value < 0) {
      setStockError(`Stock general invalido para ${productCode}`)
      return
    }

    try {
      setSavingStockCode(productCode)
      await updateProductStock({
        eventId: selectedEventId,
        productCode,
        stockQuantity: value,
        updatedBy: user?.email || 'admin',
      })
      setStockMessage(`Stock general actualizado: ${productCode}`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo actualizar stock general'
      setStockError(message)
    } finally {
      setSavingStockCode(null)
    }
  }

  async function onSaveSectorStocks(productCode: string) {
    setStockError(null)
    setStockMessage(null)

    const stocks = eventSectors.map((sector) => ({
      sectorId: sector.id,
      stockQuantity: Number(sectorStockInputs[productCode]?.[sector.id] ?? 0),
    }))

    const hasInvalid = stocks.some((item) => !Number.isFinite(item.stockQuantity) || item.stockQuantity < 0)
    if (hasInvalid) {
      setStockError(`Stock por sector invalido para ${productCode}`)
      return
    }

    const totalBySectors = stocks.reduce((acc, item) => acc + Number(item.stockQuantity || 0), 0)
    const generalStock = Number(stockInputs[productCode] ?? Number.NaN)
    if (!Number.isFinite(generalStock) || generalStock < 0) {
      setStockError(`Primero registra un stock general valido para ${productCode}`)
      return
    }
    if (totalBySectors > generalStock + 0.000001) {
      setStockError(
        `Stock por sector invalido para ${productCode}: suma sectores (${totalBySectors}) excede stock general (${generalStock})`,
      )
      return
    }

    try {
      setSavingSectorStockCode(productCode)
      await updateProductSectorStocks({
        eventId: selectedEventId,
        productCode,
        stocks,
        updatedBy: user?.email || 'admin',
      })
      setStockMessage(`Stock por sector actualizado: ${productCode}`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo actualizar stock por sector'
      setStockError(message)
    } finally {
      setSavingSectorStockCode(null)
    }
  }

  if (loading) {
    return <Loader label="Cargando kits..." />
  }

  return (
    <section className="space-y-4">
      <PageHeader title="Modulo de kits" description="Registro de kits y stock general/por sector." />

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {stockError ? <ErrorBanner message={stockError} /> : null}
      {actionMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{actionMessage}</div>
      ) : null}
      {stockMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{stockMessage}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Crear kit
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Buscar kit</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ID o nombre"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          />
        </label>
      </div>

      {filteredKits.length === 0 ? (
        <EmptyState title="Sin kits" description="No hay kits para el filtro seleccionado." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 p-3 md:hidden">
            {filteredKits.map((kit) => (
              <article key={kit.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ID</p>
                <p className="text-sm font-semibold text-slate-800">{kit.id}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre</p>
                <p className="text-sm text-slate-800">{kit.name}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Productos</p>
                <p className="text-sm text-slate-600">
                  {kit.products.length === 0
                    ? '-'
                    : kit.products.map((product) => `${product.name} (${product.quantity})`).join(', ')}
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(kit.id)
                      setForm({
                        id: kit.id,
                        name: kit.name,
                        products: kit.products.length > 0 ? kit.products : [{ id: '', name: '', quantity: 1 }],
                      })
                      setShowKitModal(true)
                      setActionError(null)
                      setActionMessage(null)
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Editar / Productos
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === kit.id}
                    onClick={() => onDelete(kit.id)}
                    aria-label="Eliminar kit"
                    title="Eliminar kit"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    {deletingId === kit.id ? (
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
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Nombre</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Productos</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredKits.map((kit) => (
                  <tr key={kit.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">{kit.id}</td>
                    <td className="px-4 py-3 text-slate-800">{kit.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {kit.products.length === 0
                        ? '-'
                        : kit.products.map((product) => `${product.name} (${product.quantity})`).join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(kit.id)
                            setForm({
                              id: kit.id,
                              name: kit.name,
                              products: kit.products.length > 0 ? kit.products : [{ id: '', name: '', quantity: 1 }],
                            })
                            setShowKitModal(true)
                            setActionError(null)
                            setActionMessage(null)
                          }}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Editar / Productos
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === kit.id}
                          onClick={() => onDelete(kit.id)}
                          aria-label="Eliminar kit"
                          title="Eliminar kit"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          {deletingId === kit.id ? (
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">Registro de stock por producto</p>
          <p className="text-xs text-slate-500">Stock general y stock por sector.</p>
        </div>

        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <label className="block max-w-md">
            <span className="mb-1 block text-sm font-medium text-slate-700">Filtrar producto</span>
            <input
              value={stockQuery}
              onChange={(event) => setStockQuery(event.target.value)}
              placeholder="Codigo o nombre"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            />
          </label>
        </div>

        {filteredStocks.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Sin productos" description="No hay productos para el filtro seleccionado." />
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {filteredStocks.map((item) => {
                const sectorTotalInput = eventSectors.reduce(
                  (acc, sector) => acc + Number(sectorStockInputs[item.productCode]?.[sector.id] ?? 0),
                  0,
                )
                return (
                  <article key={item.productCode} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">{item.productName}</p>
                  <p className="text-xs text-slate-500">{item.productCode}</p>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">Req. trabajador</p>
                      <p className="font-semibold text-slate-700">{item.perBeneficiaryQuantity}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">Beneficiarios</p>
                      <p className="font-semibold text-slate-700">{item.beneficiariesCount}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">Requerido</p>
                      <p className="font-semibold text-slate-700">{item.requiredQuantity}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">Entregado</p>
                      <p className="font-semibold text-slate-700">{item.deliveredQuantity}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">Stock general</span>
                      <input
                        value={stockInputs[item.productCode] ?? ''}
                        onChange={(event) =>
                          setStockInputs((current) => ({ ...current, [item.productCode]: event.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void onSaveGeneralStock(item.productCode)}
                      disabled={savingStockCode === item.productCode}
                      className="mt-2 w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
                    >
                      {savingStockCode === item.productCode ? 'Guardando...' : 'Guardar stock general'}
                    </button>
                  </div>

                  <details className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                      Stock por sectores · Total {sectorTotalInput}
                    </summary>
                    <div className="mt-2 space-y-2">
                      {eventSectors.map((sector) => (
                        <label key={sector.id} className="grid grid-cols-[1fr_auto] items-center gap-2">
                          <span className="text-xs text-slate-700">{sector.name}</span>
                          <input
                            value={sectorStockInputs[item.productCode]?.[sector.id] ?? '0'}
                            onChange={(event) =>
                              setSectorStockInputs((current) => ({
                                ...current,
                                [item.productCode]: {
                                  ...(current[item.productCode] || {}),
                                  [sector.id]: event.target.value,
                                },
                              }))
                            }
                            className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        onClick={() => void onSaveSectorStocks(item.productCode)}
                        disabled={savingSectorStockCode === item.productCode}
                        className="w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
                      >
                        {savingSectorStockCode === item.productCode ? 'Guardando...' : 'Guardar sectores'}
                      </button>
                      <p className="text-xs text-slate-500">
                        Validacion: suma sectores ({sectorTotalInput}) {'<='} stock general ({stockInputs[item.productCode] ?? item.stockQuantity})
                      </p>
                    </div>
                  </details>

                  <p className={`mt-2 text-xs font-semibold ${item.availableQuantity < 0.000001 ? 'text-red-700' : 'text-slate-700'}`}>
                    Disponible: {item.availableQuantity}
                  </p>
                  </article>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Producto</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Req. por trabajador</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Beneficiarios</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Requerido</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Entregado</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Stock general</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Stock sectores</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Disponible</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStocks.map((item) => {
                  const sectorTotalInput = eventSectors.reduce(
                    (acc, sector) => acc + Number(sectorStockInputs[item.productCode]?.[sector.id] ?? 0),
                    0,
                  )
                  return (
                    <tr key={item.productCode} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3 text-slate-800">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-slate-500">{item.productCode}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.perBeneficiaryQuantity}</td>
                    <td className="px-4 py-3 text-slate-700">{item.beneficiariesCount}</td>
                    <td className="px-4 py-3 text-slate-700">{item.requiredQuantity}</td>
                    <td className="px-4 py-3 text-slate-700">{item.deliveredQuantity}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={stockInputs[item.productCode] ?? ''}
                          onChange={(event) =>
                            setStockInputs((current) => ({ ...current, [item.productCode]: event.target.value }))
                          }
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                        />
                        <button
                          type="button"
                          onClick={() => void onSaveGeneralStock(item.productCode)}
                          disabled={savingStockCode === item.productCode}
                          className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
                        >
                          {savingStockCode === item.productCode ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <details className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                          Total sector: {sectorTotalInput}
                        </summary>
                        <div className="mt-2 space-y-2">
                          {eventSectors.map((sector) => {
                            return (
                              <div key={sector.id} className="grid grid-cols-[1fr_auto] items-center gap-2">
                                <span className="text-xs text-slate-700">{sector.name}</span>
                                <input
                                  value={sectorStockInputs[item.productCode]?.[sector.id] ?? '0'}
                                  onChange={(event) =>
                                    setSectorStockInputs((current) => ({
                                      ...current,
                                      [item.productCode]: {
                                        ...(current[item.productCode] || {}),
                                        [sector.id]: event.target.value,
                                      },
                                    }))
                                  }
                                  className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                                />
                              </div>
                            )
                          })}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-slate-500">
                              Validacion: suma sectores ({sectorTotalInput}) {'<='} stock general ({stockInputs[item.productCode] ?? item.stockQuantity})
                            </span>
                            <button
                              type="button"
                              onClick={() => void onSaveSectorStocks(item.productCode)}
                              disabled={savingSectorStockCode === item.productCode}
                              className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
                            >
                              {savingSectorStockCode === item.productCode ? 'Guardando...' : 'Guardar sectores'}
                            </button>
                          </div>
                        </div>
                      </details>
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold ${
                        item.availableQuantity < 0.000001 ? 'text-red-700' : 'text-slate-700'
                      }`}
                    >
                      {item.availableQuantity}
                    </td>
                    </tr>
                  )
                })}
              </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      {showKitModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">{editingId ? `Editar kit ${editingId}` : 'Crear kit'}</h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-600">
              Completa los campos obligatorios del kit y registra al menos un producto. El ID de producto se genera automaticamente.
            </p>

            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">ID kit</span>
                  <span className="mb-1 block text-xs text-slate-500">
                    Obligatorio. Identificador unico del kit.
                  </span>
                  <input
                    value={form.id}
                    disabled={!!editingId}
                    onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))}
                    placeholder="Ejemplo: KIT_MADRE_2026"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Nombre kit</span>
                  <span className="mb-1 block text-xs text-slate-500">
                    Obligatorio. Nombre visible para el usuario.
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ejemplo: Kit dia de la madre"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  />
                </label>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Productos del kit</p>
                  <button
                    type="button"
                    onClick={addProductRow}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                  >
                    + Producto
                  </button>
                </div>
                <div className="hidden gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-12">
                  <span className="md:col-span-4">ID producto (auto)</span>
                  <span className="md:col-span-5">Nombre producto</span>
                  <span className="md:col-span-2">Requerido por Persona</span>
                  <span className="text-right md:col-span-1">Quitar</span>
                </div>

                {form.products.map((product, index) => (
                  <div key={`${index}_${product.id}`} className="rounded-lg border border-slate-200 bg-white p-2">
                    <div className="grid gap-2 md:grid-cols-12">
                      <label className="block md:col-span-4">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">
                          ID producto (auto)
                        </span>
                        <input
                          value={resolveProductCode(product, index, form)}
                          readOnly
                          className="w-full rounded-lg border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-600"
                        />
                      </label>

                      <label className="block md:col-span-5">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">
                          Nombre producto
                        </span>
                        <input
                          value={product.name}
                          onChange={(event) => updateProduct(index, { name: event.target.value })}
                          placeholder="Nombre producto"
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        />
                      </label>

                      <label className="block md:col-span-2">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">
                          Requerido por persona
                        </span>
                        <input
                          type="number"
                          min={1}
                          step="1"
                          value={product.quantity}
                          onChange={(event) => updateProduct(index, { quantity: Number(event.target.value) || 1 })}
                          placeholder="Cantidad"
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        />
                      </label>

                      <div className="block md:col-span-1">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">
                          Quitar
                        </span>
                        <button
                          type="button"
                          onClick={() => removeProductRow(index)}
                          disabled={form.products.length <= 1}
                          className="w-full rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
                        >
                          X
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60 sm:w-auto"
                >
                  {saving ? 'Guardando...' : editingId ? 'Actualizar kit' : 'Crear kit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
