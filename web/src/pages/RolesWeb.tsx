import { useEffect, useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { Loader } from '../components/Loader'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import {
  deleteSecurityRole,
  listSecurityModules,
  listSecurityRoles,
  upsertSecurityRole,
} from '../services/realtimeActions'
import type { ModulePermission, WebModule, WebRole } from '../types/models'

interface RoleFormState {
  code: string
  name: string
  description: string
  active: boolean
  permissions: ModulePermission[]
}

const EMPTY_ROLE_FORM: RoleFormState = {
  code: '',
  name: '',
  description: '',
  active: true,
  permissions: [],
}

function buildEmptyPermissions(modules: WebModule[]): ModulePermission[] {
  return modules.map((moduleItem) => ({
    moduleKey: moduleItem.key,
    view: false,
    create: false,
    edit: false,
    delete: false,
  }))
}

function normalizePermissions(modules: WebModule[], input: ModulePermission[]): ModulePermission[] {
  const byModule = new Map(input.map((item) => [item.moduleKey, item]))
  return modules.map((moduleItem) => {
    const current = byModule.get(moduleItem.key)
    return {
      moduleKey: moduleItem.key,
      view: current?.view === true,
      create: current?.create === true,
      edit: current?.edit === true,
      delete: current?.delete === true,
    }
  })
}

function countEnabledPermissions(permissions: ModulePermission[]): number {
  return permissions.reduce((total, item) => {
    return total + Number(item.view) + Number(item.create) + Number(item.edit) + Number(item.delete)
  }, 0)
}

export function RolesWebPage() {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('usuarios_web', 'create')
  const canEdit = hasPermission('usuarios_web', 'edit')
  const canDelete = hasPermission('usuarios_web', 'delete')
  const canShowActions = canEdit || canDelete

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [processingCode, setProcessingCode] = useState<string | null>(null)
  const [modules, setModules] = useState<WebModule[]>([])
  const [roles, setRoles] = useState<WebRole[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [openModal, setOpenModal] = useState(false)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [form, setForm] = useState<RoleFormState>(EMPTY_ROLE_FORM)

  const filteredRoles = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return roles
    return roles.filter((role) => {
      return (
        role.code.toLowerCase().includes(normalized) ||
        role.name.toLowerCase().includes(normalized) ||
        role.description.toLowerCase().includes(normalized)
      )
    })
  }, [roles, query])

  async function loadData() {
    try {
      setLoading(true)
      const [modulesRes, rolesRes] = await Promise.all([
        listSecurityModules(),
        listSecurityRoles(),
      ])

      const normalizedModules = modulesRes
        .map((item) => ({
          key: String(item.key || '').trim().toLowerCase(),
          label: String(item.label || item.key || '').trim(),
        }))
        .filter((item) => item.key)

      const normalizedRoles = rolesRes.map((role) => ({
        code: String(role.code || '').trim().toLowerCase(),
        name: String(role.name || '').trim(),
        description: String(role.description || '').trim(),
        active: role.active !== false,
        permissions: normalizePermissions(normalizedModules, role.permissions || []),
      }))

      setModules(normalizedModules)
      setRoles(normalizedRoles)
      setError(null)
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : 'No se pudo cargar roles'
      setError(messageText)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  function openCreateModal() {
    if (!canCreate) {
      setError('No tienes permisos para crear roles.')
      return
    }

    setEditingCode(null)
    setForm({
      ...EMPTY_ROLE_FORM,
      active: true,
      permissions: buildEmptyPermissions(modules),
    })
    setOpenModal(true)
    setError(null)
    setMessage(null)
  }

  function openEditModal(role: WebRole) {
    if (!canEdit) {
      setError('No tienes permisos para editar roles.')
      return
    }

    setEditingCode(role.code)
    setForm({
      code: role.code,
      name: role.name,
      description: role.description,
      active: role.active,
      permissions: normalizePermissions(modules, role.permissions),
    })
    setOpenModal(true)
    setError(null)
    setMessage(null)
  }

  function closeModal() {
    setOpenModal(false)
    setEditingCode(null)
  }

  function setPermission(
    moduleKey: string,
    action: 'view' | 'create' | 'edit' | 'delete',
    value: boolean,
  ) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.map((item) => {
        if (item.moduleKey !== moduleKey) return item
        return { ...item, [action]: value }
      }),
    }))
  }

  async function submitRole() {
    setError(null)
    setMessage(null)

    if ((!editingCode && !canCreate) || (editingCode && !canEdit)) {
      setError('No tienes permisos para guardar roles.')
      return
    }

    const code = form.code.trim().toLowerCase()
    const name = form.name.trim()
    if (!code || !name) {
      setError('Codigo y nombre son obligatorios')
      return
    }

    try {
      setSaving(true)
      await upsertSecurityRole({
        code,
        name,
        description: form.description.trim(),
        active: form.active,
        permissions: normalizePermissions(modules, form.permissions),
      })
      setMessage(editingCode ? 'Rol actualizado' : 'Rol creado')
      closeModal()
      await loadData()
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : 'No se pudo guardar rol'
      setError(messageText)
    } finally {
      setSaving(false)
    }
  }

  async function toggleRoleStatus(role: WebRole) {
    if (!canEdit) {
      setError('No tienes permisos para activar o desactivar roles.')
      return
    }

    try {
      setProcessingCode(role.code)
      setError(null)
      setMessage(null)
      await upsertSecurityRole({
        code: role.code,
        name: role.name,
        description: role.description,
        active: !role.active,
        permissions: normalizePermissions(modules, role.permissions),
      })
      setMessage(role.active ? 'Rol desactivado' : 'Rol activado')
      await loadData()
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : 'No se pudo actualizar estado del rol'
      setError(messageText)
    } finally {
      setProcessingCode(null)
    }
  }

  async function removeRole(role: WebRole) {
    if (!canDelete) {
      setError('No tienes permisos para eliminar roles.')
      return
    }

    const confirmed = window.confirm(`Se eliminara el rol "${role.name}". ¿Deseas continuar?`)
    if (!confirmed) return

    try {
      setProcessingCode(role.code)
      setError(null)
      setMessage(null)
      await deleteSecurityRole(role.code)
      setMessage('Rol eliminado')
      await loadData()
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : 'No se pudo eliminar rol'
      setError(messageText)
    } finally {
      setProcessingCode(null)
    }
  }

  if (loading) {
    return <Loader label="Cargando roles..." />
  }

  return (
    <section className="space-y-4">
      <PageHeader title="Roles Web" description="Gestiona los roles y permisos por modulo para el panel administrador." />

      {error ? <ErrorBanner message={error} /> : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <label className="block w-full md:max-w-lg">
          <span className="mb-1 block text-sm font-medium text-slate-700">Buscar rol</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Codigo, nombre o descripcion"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        {canCreate ? (
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          Crear rol
        </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[820px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Codigo</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Nombre</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Descripcion</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Permisos</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Estado</th>
              {canShowActions ? <th className="px-4 py-3 text-left font-semibold text-slate-600">Acciones</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRoles.map((role) => {
              const busy = processingCode === role.code
              return (
                <tr key={role.code} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{role.code}</td>
                  <td className="px-4 py-3 text-slate-800">{role.name}</td>
                  <td className="px-4 py-3 text-slate-600">{role.description || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{countEnabledPermissions(role.permissions)} habilitados</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${role.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {role.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {canShowActions ? (
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(role)}
                        disabled={busy}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        Editar
                      </button>
                      ) : null}
                      {canEdit ? (
                      <button
                        type="button"
                        onClick={() => void toggleRoleStatus(role)}
                        disabled={busy}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                      >
                        {role.active ? 'Desactivar' : 'Activar'}
                      </button>
                      ) : null}
                      {canDelete ? (
                      <button
                        type="button"
                        onClick={() => void removeRole(role)}
                        disabled={busy || role.code === 'super_admin'}
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                        title="Eliminar rol"
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
              <h3 className="text-base font-semibold text-slate-900">{editingCode ? 'Editar rol' : 'Crear rol'}</h3>
              <p className="text-sm text-slate-500">Define identidad del rol y permisos por modulo.</p>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Codigo</span>
                  <input
                    value={form.code}
                    disabled={editingCode !== null}
                    onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                    placeholder="ej: supervisor_web"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Nombre</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Supervisor"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Descripcion</span>
                <input
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Detalle del alcance del rol"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Rol activo
              </label>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-2 text-left">Modulo</th>
                      <th className="px-2 py-2 text-left">Ver</th>
                      <th className="px-2 py-2 text-left">Crear</th>
                      <th className="px-2 py-2 text-left">Editar</th>
                      <th className="px-2 py-2 text-left">Eliminar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((moduleItem) => {
                      const permission = form.permissions.find((item) => item.moduleKey === moduleItem.key)
                      return (
                        <tr key={moduleItem.key} className="border-t border-slate-100">
                          <td className="px-2 py-2">{moduleItem.label}</td>
                          {(['view', 'create', 'edit', 'delete'] as const).map((action) => (
                            <td key={action} className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={permission?.[action] === true}
                                onChange={(event) => setPermission(moduleItem.key, action, event.target.checked)}
                              />
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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
                onClick={() => void submitRole()}
                disabled={saving || (!canCreate && editingCode === null) || (!canEdit && editingCode !== null)}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
              >
                {saving ? 'Guardando...' : editingCode ? 'Guardar cambios' : 'Crear rol'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
