import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { readSheet, type CellValue } from 'read-excel-file/browser'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { Loader } from '../components/Loader'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import { useRealtimeData } from '../hooks/useRealtimeData'
import { deleteWorkerAndDeliveries, listGerencias, upsertWorker, upsertWorkersBulk } from '../services/realtimeActions'
import type { Sector, Worker } from '../types/models'
import { downloadSheet } from '../utils/excel'

interface WorkerForm {
  dni: string
  nombreCompleto: string
  area: string
  gerencia: string
  sectorId: string
}

interface WorkerBulkRow {
  dni: string
  nombreCompleto: string
  area: string
  gerencia: string
  sectorRaw: string
}

const emptyForm: WorkerForm = {
  dni: '',
  nombreCompleto: '',
  area: '',
  gerencia: '',
  sectorId: '',
}

const DEFAULT_GERENCIAS = [
  'Gerencia Administrativa',
  'Gerencia General',
  'Gerencia Cítrico',
  'Gerencia Palto',
]
const PAGE_SIZE = 120

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
}

function normalizeLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
}

function resolveCatalogGerencia(rawValue: string, catalog: string[]): string {
  const token = normalizeLookup(rawValue)
  if (!token) return ''
  const matched = catalog.find((item) => normalizeLookup(item) === token)
  return matched || ''
}

function resolveSectorIdFromRow(sectorRaw: string, eventSectors: Sector[]): string {
  const token = normalizeLookup(sectorRaw)
  if (!token) return ''

  const matched = eventSectors.find((sector) => {
    return normalizeLookup(sector.id) === token || normalizeLookup(sector.name) === token
  })

  return matched?.id || ''
}

function cellToText(value: CellValue | null): string {
  if (value == null) return ''
  return String(value)
}

async function parseExcelWorkers(file: File): Promise<WorkerBulkRow[]> {
  const rows = await readSheet(file)
  if (rows.length <= 1) return []

  const headers = new Map<number, string>()
  rows[0].forEach((cell, index) => {
    headers.set(index, normalizeHeader(cellToText(cell)))
  })

  const workers: WorkerBulkRow[] = []
  rows.slice(1).forEach((row) => {
    const normalizedRow: Record<string, string> = {}
    headers.forEach((header, index) => {
      normalizedRow[header] = cellToText(row[index]).trim()
    })

    const dni = (normalizedRow.dni || normalizedRow.documento || '').replace(/\D/g, '').slice(0, 8)
    const nombreCompleto = normalizedRow.nombrecompleto || normalizedRow.nombre || normalizedRow.nombres || ''
    const area = normalizedRow.area || ''
    const gerencia = normalizedRow.gerencia || normalizedRow.centrodecosto || normalizedRow.centrocosto || ''
    const sectorRaw = normalizedRow.sector || normalizedRow.sectorid || normalizedRow.sectornombre || ''

    if (!dni || !nombreCompleto) return
    workers.push({
      dni,
      nombreCompleto,
      area,
      gerencia,
      sectorRaw,
    })
  })

  return workers
}

async function downloadWorkerTemplate() {
  await downloadSheet(
    [
      [
        { value: 'Nombre', fontWeight: 'bold' },
        { value: 'DNI', fontWeight: 'bold' },
        { value: 'Area', fontWeight: 'bold' },
        { value: 'Gerencia', fontWeight: 'bold' },
        { value: 'Sector', fontWeight: 'bold' },
      ],
      ['', '', '', '', ''],
    ],
    'plantilla_trabajadores.xlsx',
    {
      sheet: 'Plantilla',
      columns: [{ width: 36 }, { width: 14 }, { width: 24 }, { width: 24 }, { width: 24 }],
    },
  )
}

export function TrabajadoresPage() {
  const { user } = useAuth()
  const { workers, eventSectors, selectedEventId, loading, error } = useRealtimeData()

  const [gerenciasCatalog, setGerenciasCatalog] = useState<string[]>(DEFAULT_GERENCIAS)
  const [form, setForm] = useState<WorkerForm>(emptyForm)
  const [editingDni, setEditingDni] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingDni, setDeletingDni] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [page, setPage] = useState(1)
  const [showFormModal, setShowFormModal] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let disposed = false

    async function loadGerenciasCatalog() {
      try {
        const gerencias = await listGerencias()
        if (disposed) return
        if (gerencias.length > 0) {
          setGerenciasCatalog(gerencias)
        }
      } catch {
        if (!disposed) {
          setGerenciasCatalog(DEFAULT_GERENCIAS)
        }
      }
    }

    void loadGerenciasCatalog()
    return () => {
      disposed = true
    }
  }, [])

  const filteredWorkers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return workers

    return workers.filter((worker) => {
      return (
        worker.dni.toLowerCase().includes(normalized) ||
        worker.nombreCompleto.toLowerCase().includes(normalized) ||
        worker.area.toLowerCase().includes(normalized) ||
        worker.gerencia.toLowerCase().includes(normalized) ||
        worker.sectorNombre.toLowerCase().includes(normalized)
      )
    })
  }, [workers, query])

  useEffect(() => {
    setPage(1)
  }, [query, filteredWorkers.length])

  const totalPages = Math.max(1, Math.ceil(filteredWorkers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedWorkers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredWorkers.slice(start, start + PAGE_SIZE)
  }, [filteredWorkers, currentPage])

  function closeModal() {
    setShowFormModal(false)
    setForm(emptyForm)
    setEditingDni(null)
  }

  function openCreateModal() {
    setForm({
      ...emptyForm,
      gerencia: gerenciasCatalog[0] || '',
      sectorId: eventSectors[0]?.id || '',
    })
    setEditingDni(null)
    setShowFormModal(true)
    setActionError(null)
    setActionMessage(null)
  }

  function onFormChange<K extends keyof WorkerForm>(key: K, value: WorkerForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)
    setActionMessage(null)

    const payload: Worker = {
      dni: form.dni.replace(/\D/g, '').slice(0, 8),
      nombreCompleto: form.nombreCompleto.trim(),
      area: form.area.trim(),
      gerencia: resolveCatalogGerencia(form.gerencia, gerenciasCatalog),
      sectorId: form.sectorId.trim(),
      sectorNombre: '',
      eventId: selectedEventId,
      hasDeliveries: false,
    }

    if (!payload.dni || !payload.nombreCompleto) {
      setActionError('DNI y nombre completo son obligatorios')
      return
    }

    if (!payload.sectorId) {
      setActionError('Selecciona un sector para el beneficiario')
      return
    }
    if (!payload.gerencia) {
      setActionError('Selecciona una gerencia valida del catalogo')
      return
    }

    try {
      setSaving(true)
      await upsertWorker({
        worker: payload,
        eventId: selectedEventId,
        userEmail: user?.email || 'admin@gmail.com',
      })
      setActionMessage(editingDni ? 'Trabajador actualizado' : 'Trabajador creado')
      closeModal()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo guardar el trabajador'
      setActionError(message)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(worker: Worker) {
    setActionError(null)
    setActionMessage(null)

    if (worker.hasDeliveries) {
      setActionError('No se puede eliminar: el trabajador ya tiene entregas registradas en el evento.')
      return
    }

    const confirmed = window.confirm(
      `Eliminar trabajador ${worker.nombreCompleto} (${worker.dni}) del evento actual?`,
    )
    if (!confirmed) return

    try {
      setDeletingDni(worker.dni)
      await deleteWorkerAndDeliveries(worker.dni, selectedEventId)
      setActionMessage('Trabajador eliminado')
      if (editingDni === worker.dni) {
        closeModal()
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo eliminar el trabajador'
      setActionError(message)
    } finally {
      setDeletingDni(null)
    }
  }

  function onEdit(worker: Worker) {
    if (worker.hasDeliveries) {
      setActionError('No se puede editar: el trabajador ya tiene entregas registradas en el evento.')
      return
    }
    setEditingDni(worker.dni)
    setForm({
      dni: worker.dni,
      nombreCompleto: worker.nombreCompleto,
      area: worker.area,
      gerencia: worker.gerencia,
      sectorId: worker.sectorId,
    })
    setShowFormModal(true)
    setActionError(null)
    setActionMessage(null)
  }

  async function onExcelSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setActionError(null)
    setActionMessage(null)

    try {
      setImporting(true)
      setImportStatus('Leyendo archivo Excel...')
      const parsed = await parseExcelWorkers(file)

      setImportStatus(`Validando ${parsed.length} fila(s)...`)
      const missingSectorRows = parsed
        .map((row, index) => {
          const sectorId = resolveSectorIdFromRow(row.sectorRaw, eventSectors)
          return sectorId ? null : { row, rowNumber: index + 2 }
        })
        .filter((item): item is { row: WorkerBulkRow; rowNumber: number } => item !== null)

      if (missingSectorRows.length > 0) {
        const preview = missingSectorRows
          .slice(0, 8)
          .map((item) => `fila ${item.rowNumber} (DNI ${item.row.dni || '-'}, Sector "${item.row.sectorRaw || '-'}")`)
          .join('; ')
        throw new Error(`Sector invalido o vacio en: ${preview}`)
      }

      const invalidGerenciaRows = parsed
        .map((row, index) => {
          const gerencia = resolveCatalogGerencia(row.gerencia, gerenciasCatalog)
          return gerencia ? null : { row, rowNumber: index + 2 }
        })
        .filter((item): item is { row: WorkerBulkRow; rowNumber: number } => item !== null)

      if (invalidGerenciaRows.length > 0) {
        const preview = invalidGerenciaRows
          .slice(0, 8)
          .map((item) => `fila ${item.rowNumber} (DNI ${item.row.dni || '-'}, Gerencia "${item.row.gerencia || '-'}")`)
          .join('; ')
        throw new Error(`Gerencia invalida o vacia en: ${preview}`)
      }

      const mappedWorkers: Worker[] = parsed.map((row) => ({
        dni: row.dni,
        nombreCompleto: row.nombreCompleto,
        area: row.area,
        gerencia: resolveCatalogGerencia(row.gerencia, gerenciasCatalog),
        sectorId: resolveSectorIdFromRow(row.sectorRaw, eventSectors),
        sectorNombre: '',
        eventId: selectedEventId,
        hasDeliveries: false,
      }))

      const distinct = mappedWorkers.filter((worker, index, list) => index === list.findIndex((item) => item.dni === worker.dni))

      setImportStatus(`Enviando ${distinct.length} trabajador(es) al backend...`)
      const total = await upsertWorkersBulk({
        workers: distinct,
        eventId: selectedEventId,
        userEmail: user?.email || 'admin@gmail.com',
      })
      setActionMessage(`Carga masiva completada: ${total} trabajador(es)`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo procesar el archivo .xlsx'
      setActionError(message)
    } finally {
      setImporting(false)
      setImportStatus('')
    }
  }

  if (loading) {
    return <Loader label="Cargando trabajadores..." />
  }

  return (
    <section className="space-y-4">
      <PageHeader title="Trabajadores beneficiarios" description="Mantenimiento de beneficiarios para el evento seleccionado." />

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {actionMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {actionMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            disabled={importing}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Agregar beneficiario
          </button>
          <button
            type="button"
            onClick={() => void downloadWorkerTemplate()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Descargar plantilla
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-60"
          >
            {importing ? 'Importando...' : 'Carga masiva .xlsx'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={onExcelSelected}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          La plantilla debe incluir las columnas: Nombre, DNI, Area, Gerencia y Sector.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Gerencias permitidas: {gerenciasCatalog.join(' | ')}.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Buscar trabajador</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="DNI, nombre, area, gerencia o sector"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Mostrando {pagedWorkers.length} de {filteredWorkers.length} trabajador(es).
        </p>
      </div>

      {filteredWorkers.length === 0 ? (
        <EmptyState title="Sin trabajadores" description="No hay registros para el filtro seleccionado." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 p-3 md:hidden">
            {pagedWorkers.map((worker) => (
              <article key={worker.dni} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{worker.nombreCompleto}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-500">DNI</p>
                    <p className="text-slate-700">{worker.dni}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-500">Sector</p>
                    <p className="text-slate-700">{worker.sectorNombre || worker.sectorId || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-500">Area</p>
                    <p className="text-slate-700">{worker.area || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-500">Gerencia</p>
                    <p className="text-slate-700">{worker.gerencia || '-'}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onEdit(worker)}
                    disabled={worker.hasDeliveries}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(worker)}
                    disabled={deletingDni === worker.dni || worker.hasDeliveries}
                    aria-label="Eliminar trabajador"
                    title="Eliminar trabajador"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    {deletingDni === worker.dni ? (
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
                {worker.hasDeliveries ? (
                  <span className="mt-2 inline-block rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                    Con entregas
                  </span>
                ) : null}
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Nombre</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">DNI</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Area</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Gerencia</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Sector</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedWorkers.map((worker) => (
                  <tr key={worker.dni} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{worker.nombreCompleto}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.dni}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.area || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.gerencia || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.sectorNombre || worker.sectorId || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(worker)}
                          disabled={worker.hasDeliveries}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(worker)}
                          disabled={deletingDni === worker.dni || worker.hasDeliveries}
                          aria-label="Eliminar trabajador"
                          title="Eliminar trabajador"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          {deletingDni === worker.dni ? (
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
                        {worker.hasDeliveries ? (
                          <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                            Con entregas
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredWorkers.length > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage <= 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-slate-600">
            Página {currentPage} de {totalPages}
          </span>
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

      {showFormModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">
                {editingDni ? `Editar trabajador ${editingDni}` : 'Agregar beneficiario'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">DNI</span>
                <input
                  value={form.dni}
                  onChange={(event) => onFormChange('dni', event.target.value.replace(/\D/g, '').slice(0, 8))}
                  disabled={!!editingDni}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Nombre completo</span>
                <input
                  value={form.nombreCompleto}
                  onChange={(event) => onFormChange('nombreCompleto', event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Area</span>
                  <input
                    value={form.area}
                    onChange={(event) => onFormChange('area', event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Gerencia</span>
                  <select
                    value={form.gerencia}
                    onChange={(event) => onFormChange('gerencia', event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  >
                    <option value="">Selecciona gerencia</option>
                    {gerenciasCatalog.map((gerencia) => (
                      <option key={gerencia} value={gerencia}>
                        {gerencia}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Sector</span>
                <select
                  value={form.sectorId}
                  onChange={(event) => onFormChange('sectorId', event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                >
                  <option value="">Selecciona sector</option>
                  {eventSectors.map((sector) => (
                    <option key={sector.id} value={sector.id}>
                      {sector.name}
                    </option>
                  ))}
                </select>
              </label>

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
                  className="w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60 sm:w-auto"
                >
                  {saving ? 'Guardando...' : editingDni ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {importing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-100 border-t-sky-600" />
              <div>
                <h3 className="text-base font-semibold text-slate-900">Procesando carga masiva</h3>
                <p className="mt-1 text-sm text-slate-600">{importStatus || 'Preparando importacion...'}</p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-sky-600" />
            </div>
            <p className="mt-3 text-xs text-slate-500">No cierres esta ventana hasta que termine el proceso.</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
