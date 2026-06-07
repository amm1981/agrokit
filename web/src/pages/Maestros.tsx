import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { Loader } from '../components/Loader'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import {
  createGerenciaCatalogItem,
  createSectorCatalogItem,
  deleteGerenciaCatalogItem,
  deleteSectorCatalogItem,
  listGerenciasCatalog,
  listSectorsCatalog,
  updateGerenciaCatalogItem,
  updateSectorCatalogItem,
} from '../services/realtimeActions'
import type { GerenciaCatalogItem, SectorCatalogItem } from '../types/models'

interface GerenciaForm {
  originalName: string | null
  name: string
  active: boolean
}

interface SectorForm {
  editingId: string | null
  id: string
  name: string
  active: boolean
}

const emptyGerenciaForm: GerenciaForm = {
  originalName: null,
  name: '',
  active: true,
}

const emptySectorForm: SectorForm = {
  editingId: null,
  id: '',
  name: '',
  active: true,
}

function statusClass(active: boolean) {
  return active
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-slate-200 bg-slate-100 text-slate-500'
}

function normalizeQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function MaestrosPage() {
  const { hasPermission } = useAuth()
  const [gerencias, setGerencias] = useState<GerenciaCatalogItem[]>([])
  const [sectors, setSectors] = useState<SectorCatalogItem[]>([])
  const [gerenciaForm, setGerenciaForm] = useState<GerenciaForm>(emptyGerenciaForm)
  const [sectorForm, setSectorForm] = useState<SectorForm>(emptySectorForm)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const canCreate = hasPermission('maestros', 'create')
  const canEdit = hasPermission('maestros', 'edit')
  const canDelete = hasPermission('maestros', 'delete')

  const filteredGerencias = useMemo(() => {
    const normalized = normalizeQuery(query)
    if (!normalized) return gerencias
    return gerencias.filter((item) => normalizeQuery(item.name).includes(normalized))
  }, [gerencias, query])

  const filteredSectors = useMemo(() => {
    const normalized = normalizeQuery(query)
    if (!normalized) return sectors
    return sectors.filter((item) => {
      return normalizeQuery(item.id).includes(normalized) || normalizeQuery(item.name).includes(normalized)
    })
  }, [sectors, query])

  async function loadCatalogs() {
    setLoading(true)
    setActionError(null)
    try {
      const [gerenciasPayload, sectorsPayload] = await Promise.all([
        listGerenciasCatalog(),
        listSectorsCatalog(),
      ])
      setGerencias(gerenciasPayload)
      setSectors(sectorsPayload)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudieron cargar los maestros')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCatalogs()
  }, [])

  function resetGerenciaForm() {
    setGerenciaForm(emptyGerenciaForm)
  }

  function resetSectorForm() {
    setSectorForm(emptySectorForm)
  }

  function editGerencia(item: GerenciaCatalogItem) {
    setActionError(null)
    setActionMessage(null)
    setGerenciaForm({
      originalName: item.name,
      name: item.name,
      active: item.active,
    })
  }

  function editSector(item: SectorCatalogItem) {
    setActionError(null)
    setActionMessage(null)
    setSectorForm({
      editingId: item.id,
      id: item.id,
      name: item.name,
      active: item.active,
    })
  }

  async function saveGerencia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)
    setActionMessage(null)

    const name = gerenciaForm.name.trim()
    if (!name) {
      setActionError('Ingresa el nombre de la gerencia.')
      return
    }

    const isEditing = gerenciaForm.originalName !== null
    if ((isEditing && !canEdit) || (!isEditing && !canCreate)) {
      setActionError('No tienes permisos para guardar gerencias.')
      return
    }

    setSavingKey('gerencia-save')
    try {
      if (isEditing && gerenciaForm.originalName) {
        await updateGerenciaCatalogItem(gerenciaForm.originalName, {
          name,
          active: gerenciaForm.active,
        })
        setActionMessage('Gerencia actualizada. Si tenia trabajadores relacionados, ya apuntan al nuevo nombre.')
      } else {
        await createGerenciaCatalogItem({
          name,
          active: gerenciaForm.active,
        })
        setActionMessage('Gerencia creada.')
      }
      resetGerenciaForm()
      await loadCatalogs()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo guardar la gerencia')
    } finally {
      setSavingKey(null)
    }
  }

  async function saveSector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)
    setActionMessage(null)

    const id = sectorForm.id.trim()
    const name = sectorForm.name.trim()
    if (!name) {
      setActionError('Ingresa el nombre del sector.')
      return
    }

    const isEditing = sectorForm.editingId !== null
    if (!isEditing && !id) {
      setActionError('Ingresa un ID para el sector.')
      return
    }

    if ((isEditing && !canEdit) || (!isEditing && !canCreate)) {
      setActionError('No tienes permisos para guardar sectores.')
      return
    }

    setSavingKey('sector-save')
    try {
      if (isEditing && sectorForm.editingId) {
        await updateSectorCatalogItem(sectorForm.editingId, {
          name,
          active: sectorForm.active,
        })
        setActionMessage('Sector actualizado.')
      } else {
        await createSectorCatalogItem({
          id,
          name,
          active: sectorForm.active,
        })
        setActionMessage('Sector creado.')
      }
      resetSectorForm()
      await loadCatalogs()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo guardar el sector')
    } finally {
      setSavingKey(null)
    }
  }

  async function removeGerencia(item: GerenciaCatalogItem) {
    if (!canDelete) {
      setActionError('No tienes permisos para eliminar gerencias.')
      return
    }

    const warning = item.canDelete
      ? `Se eliminara la gerencia "${item.name}".`
      : `La gerencia "${item.name}" tiene trabajadores relacionados. Se desactivara para proteger el historico.`
    if (!window.confirm(`${warning}\n\nDeseas continuar?`)) return

    setSavingKey(`gerencia-delete-${item.name}`)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await deleteGerenciaCatalogItem(item.name)
      setActionMessage(result.message || 'Accion completada.')
      await loadCatalogs()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo eliminar la gerencia')
    } finally {
      setSavingKey(null)
    }
  }

  async function removeSector(item: SectorCatalogItem) {
    if (!canDelete) {
      setActionError('No tienes permisos para eliminar sectores.')
      return
    }

    const warning = item.canDelete
      ? `Se eliminara el sector "${item.name}".`
      : `El sector "${item.name}" tiene informacion relacionada. Se desactivara para proteger eventos y entregas.`
    if (!window.confirm(`${warning}\n\nDeseas continuar?`)) return

    setSavingKey(`sector-delete-${item.id}`)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await deleteSectorCatalogItem(item.id)
      setActionMessage(result.message || 'Accion completada.')
      await loadCatalogs()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo eliminar el sector')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Maestros"
        description="Mantenimiento de gerencias y sectores usados por trabajadores, eventos y entregas."
        meta={
          <button
            type="button"
            onClick={() => void loadCatalogs()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Refrescar
          </button>
        }
      />

      {actionError ? <ErrorBanner message={actionError} /> : null}
      {actionMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {actionMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Buscar maestro
        </label>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o codigo..."
          className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {loading ? (
        <Loader label="Cargando maestros..." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Gerencias</h3>
                <p className="mt-1 text-sm text-slate-500">Editar una gerencia actualiza los trabajadores asociados.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {filteredGerencias.length} registros
              </span>
            </div>

            <form onSubmit={saveGerencia} className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nombre</span>
                  <input
                    value={gerenciaForm.name}
                    onChange={(event) => setGerenciaForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={savingKey === 'gerencia-save'}
                    placeholder="Gerencia Cítrico"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                  />
                </label>
                <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={gerenciaForm.active}
                    onChange={(event) => setGerenciaForm((current) => ({ ...current, active: event.target.checked }))}
                    className="h-4 w-4 accent-emerald-700"
                  />
                  Activo
                </label>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {gerenciaForm.originalName ? (
                  <button
                    type="button"
                    onClick={resetGerenciaForm}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={savingKey === 'gerencia-save' || (!gerenciaForm.originalName && !canCreate) || (gerenciaForm.originalName !== null && !canEdit)}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {gerenciaForm.originalName ? 'Actualizar' : 'Crear gerencia'}
                </button>
              </div>
            </form>

            <div className="overflow-x-auto">
              {filteredGerencias.length === 0 ? (
                <EmptyState title="Sin gerencias" description="No se encontraron registros con el filtro actual." />
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Nombre</th>
                      <th className="px-3 py-3 font-semibold">Estado</th>
                      <th className="px-3 py-3 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredGerencias.map((item) => (
                      <tr key={item.name} className="align-middle">
                        <td className="px-3 py-3 font-medium text-slate-900">{item.name}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.active)}`}>
                            {item.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => editGerencia(item)}
                              disabled={!canEdit}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeGerencia(item)}
                              disabled={!canDelete || savingKey === `gerencia-delete-${item.name}`}
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {item.canDelete ? 'Eliminar' : 'Desactivar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Sectores</h3>
                <p className="mt-1 text-sm text-slate-500">El codigo del sector no se cambia cuando ya existe historico.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {filteredSectors.length} registros
              </span>
            </div>

            <form onSubmit={saveSector} className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 md:grid-cols-[0.75fr_1fr_auto]">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">ID</span>
                  <input
                    value={sectorForm.id}
                    onChange={(event) => setSectorForm((current) => ({ ...current, id: event.target.value }))}
                    disabled={sectorForm.editingId !== null || savingKey === 'sector-save'}
                    placeholder="pisco"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nombre</span>
                  <input
                    value={sectorForm.name}
                    onChange={(event) => setSectorForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={savingKey === 'sector-save'}
                    placeholder="Pisco"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                  />
                </label>
                <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={sectorForm.active}
                    onChange={(event) => setSectorForm((current) => ({ ...current, active: event.target.checked }))}
                    className="h-4 w-4 accent-emerald-700"
                  />
                  Activo
                </label>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {sectorForm.editingId ? (
                  <button
                    type="button"
                    onClick={resetSectorForm}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={savingKey === 'sector-save' || (!sectorForm.editingId && !canCreate) || (sectorForm.editingId !== null && !canEdit)}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {sectorForm.editingId ? 'Actualizar' : 'Crear sector'}
                </button>
              </div>
            </form>

            <div className="overflow-x-auto">
              {filteredSectors.length === 0 ? (
                <EmptyState title="Sin sectores" description="No se encontraron registros con el filtro actual." />
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Sector</th>
                      <th className="px-3 py-3 font-semibold">Estado</th>
                      <th className="px-3 py-3 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSectors.map((item) => (
                      <tr key={item.id} className="align-middle">
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{item.id}</p>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.active)}`}>
                            {item.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => editSector(item)}
                              disabled={!canEdit}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeSector(item)}
                              disabled={!canDelete || savingKey === `sector-delete-${item.id}`}
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {item.canDelete ? 'Eliminar' : 'Desactivar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
