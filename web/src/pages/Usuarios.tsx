import { useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { Loader } from '../components/Loader'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import { useRealtimeData } from '../hooks/useRealtimeData'
import { createPdaUser, deletePdaUser, updatePdaUserProfile } from '../services/realtimeActions'
import { formatDateTime } from '../utils/format'

interface PdaUserFormState {
  email: string
  password: string
  confirmPassword: string
  fullName: string
  assignedPdaId: string
  active: boolean
  sectorIds: string[]
}

const EMPTY_FORM: PdaUserFormState = {
  email: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  assignedPdaId: '',
  active: true,
  sectorIds: [],
}

export function UsuariosPage() {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('usuarios_pda', 'create')
  const canEdit = hasPermission('usuarios_pda', 'edit')
  const canDelete = hasPermission('usuarios_pda', 'delete')

  const { users, eventSectors, selectedEventId, refreshData, loading, error } = useRealtimeData()
  const canShowActions = canEdit || canDelete
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [processingUid, setProcessingUid] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const [openModal, setOpenModal] = useState(false)
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [form, setForm] = useState<PdaUserFormState>(EMPTY_FORM)

  const pdaUsers = useMemo(() => users.filter((item) => item.role === 'pda'), [users])

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return pdaUsers
    return pdaUsers.filter((item) => {
      return (
        item.email.toLowerCase().includes(normalized) ||
        item.fullName.toLowerCase().includes(normalized) ||
        item.assignedPdaId.toLowerCase().includes(normalized)
      )
    })
  }, [pdaUsers, query])

  const sectorNameById = useMemo(() => {
    return new Map(eventSectors.map((sector) => [sector.id, sector.name]))
  }, [eventSectors])

  function openCreateModal() {
    if (!canCreate) {
      setActionError('No tienes permisos para crear usuarios PDA.')
      return
    }
    setEditingUid(null)
    setForm({
      ...EMPTY_FORM,
      active: true,
      sectorIds: eventSectors.length > 0 ? [eventSectors[0].id] : [],
    })
    setOpenModal(true)
    setActionError(null)
    setActionMessage(null)
  }

  function openEditModal(uid: string) {
    if (!canEdit) {
      setActionError('No tienes permisos para editar usuarios PDA.')
      return
    }
    const current = pdaUsers.find((item) => item.uid === uid)
    if (!current) return
    setEditingUid(uid)
    setForm({
      email: current.email,
      password: '',
      confirmPassword: '',
      fullName: current.fullName,
      assignedPdaId: current.assignedPdaId,
      active: current.active,
      sectorIds: current.sectorIds,
    })
    setOpenModal(true)
    setActionError(null)
    setActionMessage(null)
  }

  function closeModal() {
    setOpenModal(false)
    setEditingUid(null)
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

  async function submitUser() {
    setActionError(null)
    setActionMessage(null)

    if ((!editingUid && !canCreate) || (editingUid && !canEdit)) {
      setActionError('No tienes permisos para guardar usuarios PDA.')
      return
    }

    if (!selectedEventId.trim()) {
      setActionError('Selecciona un evento activo para registrar usuarios PDA')
      return
    }
    if (!form.email.trim() || !form.fullName.trim() || !form.assignedPdaId.trim()) {
      setActionError('Correo, nombre completo y PDA asignado son obligatorios')
      return
    }
    if (form.sectorIds.length === 0) {
      setActionError('Debes asignar al menos un sector')
      return
    }
    if (!editingUid && form.password.trim().length < 6) {
      setActionError('La contrasena debe tener minimo 6 caracteres')
      return
    }
    if (form.password.trim() && form.password !== form.confirmPassword) {
      setActionError('La confirmacion de contrasena no coincide')
      return
    }

    try {
      setSaving(true)

      if (!editingUid) {
        await createPdaUser({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          fullName: form.fullName.trim(),
          assignedPdaId: form.assignedPdaId.trim(),
          eventId: selectedEventId,
          sectorIds: form.sectorIds,
        })
      } else {
        await updatePdaUserProfile(editingUid, {
          fullName: form.fullName.trim(),
          assignedPdaId: form.assignedPdaId.trim(),
          active: form.active,
          eventId: selectedEventId,
          sectorIds: form.sectorIds,
          password: form.password.trim() ? form.password : undefined,
        })
      }

      setActionMessage(editingUid ? 'Usuario PDA actualizado' : 'Usuario PDA creado')
      refreshData()
      closeModal()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo guardar usuario PDA'
      setActionError(message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(uid: string, nextActive: boolean) {
    if (!canEdit) {
      setActionError('No tienes permisos para activar o desactivar usuarios PDA.')
      return
    }

    try {
      setProcessingUid(uid)
      setActionError(null)
      setActionMessage(null)
      await updatePdaUserProfile(uid, { active: nextActive })
      setActionMessage(nextActive ? 'Usuario activado' : 'Usuario desactivado')
      refreshData()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo actualizar estado del usuario'
      setActionError(message)
    } finally {
      setProcessingUid(null)
    }
  }

  async function removeUser(uid: string, email: string) {
    if (!canDelete) {
      setActionError('No tienes permisos para eliminar usuarios PDA.')
      return
    }

    const confirmed = window.confirm(`Se eliminara el usuario PDA "${email}". ¿Deseas continuar?`)
    if (!confirmed) return

    try {
      setProcessingUid(uid)
      setActionError(null)
      setActionMessage(null)
      await deletePdaUser(uid)
      setActionMessage('Usuario PDA eliminado')
      refreshData()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo eliminar usuario PDA'
      setActionError(message)
    } finally {
      setProcessingUid(null)
    }
  }

  if (loading) {
    return <Loader label="Cargando usuarios PDA..." />
  }

  return (
    <section className="space-y-4">
      <PageHeader title="Usuarios PDA" description="Gestiona usuarios del aplicativo movil por evento y sectores." />

      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {actionMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{actionMessage}</div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <label className="block w-full md:max-w-lg">
          <span className="mb-1 block text-sm font-medium text-slate-700">Buscar usuario PDA</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Correo, nombre o PDA"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
        </label>

        {canCreate ? (
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          Crear usuario PDA
        </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[920px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Correo</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Nombre</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">PDA asignado</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Sectores</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Estado</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Creado</th>
              {canShowActions ? <th className="px-4 py-3 text-left font-semibold text-slate-600">Acciones</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((item) => {
              const busy = processingUid === item.uid
              return (
                <tr key={item.uid} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{item.email}</td>
                  <td className="px-4 py-3 text-slate-800">{item.fullName || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{item.assignedPdaId || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {item.sectorIds.map((sectorId) => sectorNameById.get(sectorId) || sectorId).join(', ') || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {item.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(item.createdAt)}</td>
                  {canShowActions ? (
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(item.uid)}
                        disabled={busy}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        Editar
                      </button>
                      ) : null}
                      {canEdit ? (
                      <button
                        type="button"
                        onClick={() => void toggleActive(item.uid, !item.active)}
                        disabled={busy}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                      >
                        {item.active ? 'Desactivar' : 'Activar'}
                      </button>
                      ) : null}
                      {canDelete ? (
                      <button
                        type="button"
                        onClick={() => void removeUser(item.uid, item.email)}
                        disabled={busy}
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                        title="Eliminar usuario PDA"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                      ) : null}
                    </div>
                  </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {openModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">{editingUid ? 'Editar usuario PDA' : 'DA'}</h3>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Correo</span>
                  <input
                    type="email"
                    value={form.email}
                    disabled={editingUid !== null}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="usuario.pda@empresa.com"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:bg-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Nombre completo</span>
                  <input
                    value={form.fullName}
                    onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">PDA asignado</span>
                  <input
                    value={form.assignedPdaId}
                    onChange={(event) => setForm((current) => ({ ...current, assignedPdaId: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Contrasena {editingUid ? '(opcional)' : ''}</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Confirmar contrasena</span>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  />
                </label>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Usuario activo
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">Sectores asignados</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {eventSectors.map((sector) => (
                    <label key={sector.id} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.sectorIds.includes(sector.id)}
                        onChange={() => toggleSector(sector.id)}
                      />
                      <span>{sector.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitUser()}
                disabled={saving || (!canCreate && editingUid === null) || (!canEdit && editingUid !== null)}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
              >
                {saving ? 'Guardando...' : editingUid ? 'Guardar cambios' : 'Crear usuario PDA'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
