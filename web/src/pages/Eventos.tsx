import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { Loader } from '../components/Loader'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import { useRealtimeData } from '../hooks/useRealtimeData'
import { upsertEvent } from '../services/realtimeActions'
import { apiRequest } from '../services/backend'
import type { EventSummary } from '../types/models'
import { formatDateTime } from '../utils/format'

interface EventForm {
  id: string
  name: string
  startDateInput: string
  endDateInput: string
  status: EventSummary['status']
  sectorIds: string[]
}

const emptyForm: EventForm = {
  id: '',
  name: '',
  startDateInput: '',
  endDateInput: '',
  status: 'published',
  sectorIds: [],
}

const PAGE_SIZE = 8

const statusLabels: Record<EventSummary['status'], string> = {
  draft: 'Borrador',
  published: 'Publicado',
  closed: 'Cerrado',
  archived: 'Archivado',
}

const statusClasses: Record<EventSummary['status'], string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  closed: 'bg-amber-50 text-amber-700 ring-amber-200',
  archived: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
}

export function EventosPage() {
  const { user, hasPermission } = useAuth()
  const { events, sectors, selectedEventId, setSelectedEventId, refreshData, loading, error } = useRealtimeData()
  const canCreate = hasPermission('eventos', 'create')
  const canEdit = hasPermission('eventos', 'edit')
  const [form, setForm] = useState<EventForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [eventSectorNames, setEventSectorNames] = useState<Record<string, string[]>>({})

  useEffect(() => {
    let disposed = false

    async function loadEventSectors() {
      if (events.length === 0) {
        setEventSectorNames({})
        return
      }

      const rows = await Promise.all(
        events.map(async (event) => {
          try {
            const eventSectors = await apiRequest<Array<{ name?: string }>>(`/api/sectors?eventId=${encodeURIComponent(event.id)}`)
            const names = eventSectors
              .map((item) => String(item.name || '').trim())
              .filter(Boolean)
            return [event.id, names] as const
          } catch {
            return [event.id, []] as const
          }
        }),
      )

      if (!disposed) {
        setEventSectorNames(Object.fromEntries(rows))
      }
    }

    void loadEventSectors()

    return () => {
      disposed = true
    }
  }, [events])

  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return events
    return events.filter((item) => item.id.toLowerCase().includes(normalized) || item.name.toLowerCase().includes(normalized))
  }, [events, query])

  useEffect(() => {
    setPage(1)
  }, [query, events.length])

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedEvents = filteredEvents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const firstVisible = filteredEvents.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const lastVisible = Math.min(currentPage * PAGE_SIZE, filteredEvents.length)
  const now = Date.now()

  const totals = useMemo(() => {
    return {
      total: events.length,
      published: events.filter((event) => event.status === 'published').length,
      current: events.filter((event) => isEventCurrent(event, now)).length,
    }
  }, [events, now])

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  function openNewEventModal() {
    if (!canCreate) {
      setActionError('No tienes permisos para crear eventos.')
      return
    }
    resetForm()
    setActionError(null)
    setActionMessage(null)
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    resetForm()
  }

  function toggleSector(sectorId: string) {
    setForm((current) => {
      const set = new Set(current.sectorIds)
      if (set.has(sectorId)) {
        set.delete(sectorId)
      } else {
        set.add(sectorId)
      }
      return { ...current, sectorIds: Array.from(set) }
    })
  }

  async function onEdit(event: EventSummary) {
    if (!canEdit) {
      setActionError('No tienes permisos para editar eventos.')
      return
    }

    try {
      const eventSectorRows = await apiRequest<Array<{ id: string }>>(`/api/sectors?eventId=${encodeURIComponent(event.id)}`)
      const sectorIds = eventSectorRows.map((item) => String(item.id || '').trim()).filter(Boolean)

      setEditingId(event.id)
      setForm({
        id: event.id,
        name: event.name,
        startDateInput: event.startDate,
        endDateInput: event.endDate,
        status: event.status,
        sectorIds,
      })
      setActionError(null)
      setActionMessage(null)
      setModalOpen(true)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo cargar sectores del evento'
      setActionError(message)
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)
    setActionMessage(null)

    if ((editingId && !canEdit) || (!editingId && !canCreate)) {
      setActionError('No tienes permisos para guardar eventos.')
      return
    }

    const startDate = form.startDateInput.trim()
    const endDate = form.endDateInput.trim()

    if (!startDate || !endDate) {
      setActionError('Debes definir fecha de inicio y fin')
      return
    }

    try {
      setSaving(true)
      await upsertEvent({
        id: form.id,
        name: form.name,
        startDate,
        endDate,
        status: form.status,
        updatedBy: user?.email || 'admin@gmail.com',
        sectorIds: form.sectorIds,
      })
      setActionMessage(editingId ? 'Evento actualizado' : 'Evento creado')
      if (!selectedEventId) {
        setSelectedEventId(form.id.trim())
      }
      refreshData()
      setModalOpen(false)
      resetForm()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo guardar el evento'
      setActionError(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Loader label="Cargando eventos..." />
  }

  return (
    <section className="space-y-5">
      <PageHeader
        title="Eventos"
        meta={canCreate ? (
          <button
            type="button"
            onClick={openNewEventModal}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <span className="text-xl leading-none">+</span>
            Nuevo evento
          </button>
        ) : null}
      />

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {actionMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{actionMessage}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total de eventos" value={totals.total} detail="Eventos creados en el sistema" icon="calendar" />
        <MetricCard label="Publicados" value={totals.published} detail="Eventos en estado publicado" icon="document" />
        <MetricCard label="Vigentes" value={totals.current} detail="Activos segun el rango de fechas" icon="pulse" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between md:px-5">
          <h3 className="text-base font-semibold text-slate-900">Eventos registrados</h3>
          <label className="relative block w-full md:max-w-sm">
            <span className="sr-only">Buscar por ID o nombre</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por ID o nombre..."
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Sin eventos"
              description={query.trim() ? 'No se encontraron eventos con ese ID o nombre.' : 'No hay eventos creados.'}
            />
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {paginatedEvents.map((event) => (
                <article key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{event.name}</p>
                      <p className="mt-1 break-all text-xs text-slate-500">{event.id}</p>
                    </div>
                    <StatusBadge status={event.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <InfoBlock label="Inicio" value={formatEventDate(event.startDate, event.startAt)} />
                    <InfoBlock label="Fin" value={formatEventDate(event.endDate, event.endAt)} />
                    <div className="col-span-2">
                      <p className="font-semibold uppercase text-slate-500">Vigencia</p>
                      <VigenciaBadge vigente={isEventCurrent(event, now)} />
                    </div>
                    <InfoBlock
                      label="Sectores"
                      value={formatSectorNames(eventSectorNames[event.id])}
                      className="col-span-2"
                    />
                  </div>
                  {canEdit ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => void onEdit(event)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Editar
                    </button>
                  </div>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <TableHead>ID</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Vigencia</TableHead>
                    <TableHead>Sectores</TableHead>
                    {canEdit ? <TableHead>Acciones</TableHead> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{event.id}</td>
                      <td className="px-4 py-3 text-slate-800">{event.name}</td>
                      <td className="px-4 py-3 text-slate-600">{formatEventDate(event.startDate, event.startAt)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatEventDate(event.endDate, event.endAt)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={event.status} />
                      </td>
                      <td className="px-4 py-3">
                        <VigenciaBadge vigente={isEventCurrent(event, now)} />
                      </td>
                      <td className="max-w-[240px] px-4 py-3 text-slate-600">{formatSectorNames(eventSectorNames[event.id])}</td>
                      {canEdit ? (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void onEdit(event)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Editar
                        </button>
                      </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between md:px-5">
              <span>
                Mostrando {firstVisible} a {lastVisible} de {filteredEvents.length} eventos
              </span>
              <div className="flex items-center gap-2">
                <PaginationButton disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  &lt;
                </PaginationButton>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
                  <PaginationButton key={item} active={item === currentPage} onClick={() => setPage(item)}>
                    {item}
                  </PaginationButton>
                ))}
                <PaginationButton
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                >
                  &gt;
                </PaginationButton>
              </div>
            </div>
          </>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{editingId ? `Editar evento ${editingId}` : 'Nuevo evento'}</h3>
                <p className="mt-1 text-sm text-slate-500">Configura fechas, estado y sectores habilitados.</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">ID evento</span>
                  <input
                    value={form.id}
                    disabled={!!editingId}
                    onChange={(e) => setForm((current) => ({ ...current, id: e.target.value.trim() }))}
                    placeholder="ejemplo: navidad_2026"
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Nombre</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder="Navidad 2026"
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Inicio</span>
                  <input
                    type="date"
                    value={form.startDateInput}
                    onChange={(e) => setForm((current) => ({ ...current, startDateInput: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Fin</span>
                  <input
                    type="date"
                    value={form.endDateInput}
                    onChange={(e) => setForm((current) => ({ ...current, endDateInput: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Estado</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as EventSummary['status'] }))}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="draft">Borrador</option>
                    <option value="published">Publicado</option>
                    <option value="closed">Cerrado</option>
                    <option value="archived">Archivado</option>
                  </select>
                </label>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">Sectores habilitados</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {sectors.map((sector) => (
                    <label key={sector.id} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.sectorIds.includes(sector.id)}
                        onChange={() => toggleSector(sector.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      {sector.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? 'Guardando...' : editingId ? 'Actualizar evento' : 'Crear evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string
  value: number
  detail: string
  icon: 'calendar' | 'document' | 'pulse'
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <MetricIcon icon={icon} />
        </span>
        <div>
          <p className="text-3xl font-semibold text-slate-950">{value}</p>
          <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-2 text-xs font-medium text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  )
}

function MetricIcon({ icon }: { icon: 'calendar' | 'document' | 'pulse' }) {
  if (icon === 'document') {
    return (
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 3h7l4 4v14H7V3Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 3v5h5M10 12h4M10 16h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (icon === 'pulse') {
    return (
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 12h4l2-5 4 11 2-6h6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function StatusBadge({ status }: { status: EventSummary['status'] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  )
}

function VigenciaBadge({ vigente }: { vigente: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
        vigente ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
      }`}
    >
      {vigente ? 'Vigente' : 'No vigente'}
    </span>
  )
}

function TableHead({ children }: { children: string }) {
  return <th className="px-4 py-3 text-left font-semibold text-slate-600">{children}</th>
}

function InfoBlock({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="font-semibold uppercase text-slate-500">{label}</p>
      <p className="text-slate-700">{value}</p>
    </div>
  )
}

function PaginationButton({
  children,
  active = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

function isEventCurrent(event: EventSummary, now: number) {
  const startAt = event.startAt || parseDate(event.startDate, 'start')
  const endAt = event.endAt || parseDate(event.endDate, 'end')
  return startAt > 0 && endAt > 0 && startAt <= now && now <= endAt
}

function parseDate(value: string, boundary: 'start' | 'end') {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const date = new Date(`${trimmed}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 0
  if (boundary === 'end') {
    date.setHours(23, 59, 59, 999)
  }
  return date.getTime()
}

function formatEventDate(dateValue: string, timestamp: number) {
  if (dateValue) {
    const [year, month, day] = dateValue.split('-')
    if (year && month && day) return `${day}/${month}/${year}`
  }
  return formatDateTime(timestamp)
}

function formatSectorNames(names: string[] | undefined) {
  if (!names || names.length === 0) return '-'
  return names.join(', ')
}
