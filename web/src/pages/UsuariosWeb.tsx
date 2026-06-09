import { useEffect, useMemo, useState } from 'react'
import { ErrorBanner } from '../components/ErrorBanner'
import { Loader } from '../components/Loader'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import {
  deleteWebUser,
  listSecurityModules,
  listSecurityRoles,
  listWebUsers,
  upsertWebUser,
} from '../services/realtimeActions'
import type { ModulePermission, WebModule, WebRole, WebUserProfile } from '../types/models'
import { formatDateTime } from '../utils/format'

interface WebUserFormState {
  email: string
  password: string
  confirmPassword: string
  fullName: string
  assignedPdaId: string
  active: boolean
  roleCodes: string[]
  permissions: ModulePermission[]
}

const EMPTY_FORM: WebUserFormState = {
  email: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  assignedPdaId: 'ADMIN_WEB',
  active: true,
  roleCodes: [],
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

export function UsuariosWebPage() {
  const { user, hasPermission } = useAuth()
  const canCreate = hasPermission('usuarios_web', 'create')
  const canEdit = hasPermission('usuarios_web', 'edit')
  const canDelete = hasPermission('usuarios_web', 'delete')
  const canShowActions = canEdit || canDelete

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [processingEmail, setProcessingEmail] = useState<string | null>(null)
  const [modules, setModules] = useState<WebModule[]>([])
  const [roles, setRoles] = useState<WebRole[]>([])
  const [users, setUsers] = useState<WebUserProfile[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [openModal, setOpenModal] = useState(false)
  const [editingEmail, setEditingEmail] = useState<string | null>(null)
  const [form, setForm] = useState<WebUserFormState>(EMPTY_FORM)

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return users
    return users.filter((item) => {
      return item.email.toLowerCase().includes(normalized) || item.fullName.toLowerCase().includes(normalized)
    })
  }, [users, query])

  async function loadData() {
    try {
      setLoading(true)
      const [modulesRes, rolesRes, usersRes] = await Promise.all([
        listSecurityModules(),
        listSecurityRoles(),
        listWebUsers(),
      ])

      const normalizedModules = modulesRes
        .map((item) => ({
          key: String(item.key || '').trim().toLowerCase(),
          label: String(item.label || item.key || '').trim(),
        }))
        .filter((item) => item.key)

      const normalizedRoles = rolesRes.map((item) => ({
        code: String(item.code || '').trim().toLowerCase(),
        name: String(item.name || '').trim(),
        description: String(item.description || '').trim(),
        active: item.active !== false,
        permissions: normalizePermissions(normalizedModules, item.permissions || []),
      }))

      const normalizedUsers = usersRes.map((item) => ({
        uid: String(item.uid || item.email || '').trim().toLowerCase(),
        email: String(item.email || '').trim().toLowerCase(),
        fullName: String(item.fullName || '').trim(),
        assignedPdaId: String(item.assignedPdaId || 'ADMIN_WEB').trim() || 'ADMIN_WEB',
        role: 'admin' as const,
        active: item.active !== false,
        createdAt: Number(item.createdAt || 0),
        roleCodes: Array.isArray(item.roleCodes)
          ? item.roleCodes.map((roleCode) => String(roleCode || '').trim().toLowerCase()).filter(Boolean)
          : [],
        modulePermissions: normalizePermissions(normalizedModules, item.modulePermissions || []),
        directModulePermissions: normalizePermissions(normalizedModules, item.directModulePermissions || []),
      }))

      setModules(normalizedModules)
      setRoles(normalizedRoles)
      setUsers(normalizedUsers)
      setError(null)
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : 'No se pudo cargar usuarios web'
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
      setError('No tienes permisos para crear usuarios web.')
      return
    }

    setEditingEmail(null)
    setForm({
      ...EMPTY_FORM,
      active: true,
      roleCodes: [],
      permissions: buildEmptyPermissions(modules),
    })
    setOpenModal(true)
    setError(null)
    setMessage(null)
  }

  function openEditModal(userItem: WebUserProfile) {
    if (!canEdit) {
      setError('No tienes permisos para editar usuarios web.')
      return
    }

    setEditingEmail(userItem.email)
    setForm({
      email: userItem.email,
      password: '',
      confirmPassword: '',
      fullName: userItem.fullName,
      assignedPdaId: userItem.assignedPdaId || 'ADMIN_WEB',
      active: userItem.active,
      roleCodes: [...userItem.roleCodes],
      permissions: normalizePermissions(modules, userItem.directModulePermissions),
    })
    setOpenModal(true)
    setError(null)
    setMessage(null)
  }

  function closeModal() {
    setOpenModal(false)
    setEditingEmail(null)
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

  function toggleRole(roleCode: string, checked: boolean) {
    setForm((current) => {
      const set = new Set(current.roleCodes)
      if (checked) set.add(roleCode)
      else set.delete(roleCode)
      return { ...current, roleCodes: Array.from(set) }
    })
  }

  async function submitUser() {
    setError(null)
    setMessage(null)

    if ((!editingEmail && !canCreate) || (editingEmail && !canEdit)) {
      setError('No tienes permisos para guardar usuarios web.')
      return
    }

    const email = form.email.trim().toLowerCase()
    if (!email || !form.fullName.trim()) {
      setError('Correo y nombre completo son obligatorios')
      return
    }

    if (!editingEmail && form.password.trim().length < 6) {
      setError('La contrasena debe tener minimo 6 caracteres')
      return
    }

    if (form.password.trim() && form.password !== form.confirmPassword) {
      setError('La confirmacion de contrasena no coincide')
      return
    }

    try {
      setSaving(true)
      await upsertWebUser({
        email,
        password: form.password.trim() ? form.password : undefined,
        fullName: form.fullName.trim(),
        assignedPdaId: form.assignedPdaId.trim() || 'ADMIN_WEB',
        active: form.active,
        roleCodes: form.roleCodes,
        modulePermissions: normalizePermissions(modules, form.permissions),
      })
      setMessage(editingEmail ? 'Usuario web actualizado' : 'Usuario web creado')
      closeModal()
      await loadData()
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : 'No se pudo guardar usuario web'
      setError(messageText)
    } finally {
      setSaving(false)
    }
  }

  async function toggleUserStatus(userItem: WebUserProfile) {
    if (!canEdit) {
      setError('No tienes permisos para activar o desactivar usuarios web.')
      return
    }

    try {
      setProcessingEmail(userItem.email)
      setError(null)
      setMessage(null)
      await upsertWebUser({
        email: userItem.email,
        fullName: userItem.fullName,
        assignedPdaId: userItem.assignedPdaId,
        active: !userItem.active,
        roleCodes: userItem.roleCodes,
        modulePermissions: normalizePermissions(modules, userItem.directModulePermissions),
      })
      setMessage(userItem.active ? 'Usuario desactivado' : 'Usuario activado')
      await loadData()
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : 'No se pudo actualizar estado del usuario'
      setError(messageText)
    } finally {
      setProcessingEmail(null)
    }
  }

  async function removeUser(userItem: WebUserProfile) {
    if (!canDelete) {
      setError('No tienes permisos para eliminar usuarios web.')
      return
    }

    if (user?.email?.trim().toLowerCase() === userItem.email) {
      setError('No puedes eliminar tu propio usuario web')
      return
    }

    const confirmed = window.confirm(`Se eliminara el usuario "${userItem.email}". ¿Deseas continuar?`)
    if (!confirmed) return

    try {
      setProcessingEmail(userItem.email)
      setError(null)
      setMessage(null)
      await deleteWebUser(userItem.email)
      setMessage('Usuario web eliminado')
      await loadData()
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : 'No se pudo eliminar usuario web'
      setError(messageText)
    } finally {
      setProcessingEmail(null)
    }
  }

  if (loading) {
    return <Loader label="Cargando usuarios web..." />
  }

  return (
    <section className="space-y-4">
      <PageHeader title="Usuarios Web" description="Gestiona usuarios administradores y asignacion de roles/permisos." />

      {error ? <ErrorBanner message={error} /> : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <label className="block w-full md:max-w-lg">
          <span className="mb-1 block text-sm font-medium text-slate-700">Buscar usuario web</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Correo o nombre"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        {canCreate ? (
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          Crear usuario web
        </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[920px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Correo</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Nombre</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Roles</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Permisos</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Estado</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Creado</th>
              {canShowActions ? <th className="px-4 py-3 text-left font-semibold text-slate-600">Acciones</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((userItem) => {
              const busy = processingEmail === userItem.email
              return (
                <tr key={userItem.email} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{userItem.email}</td>
                  <td className="px-4 py-3 text-slate-800">{userItem.fullName || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{userItem.roleCodes.join(', ') || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{countEnabledPermissions(userItem.modulePermissions)} habilitados</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${userItem.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {userItem.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(userItem.createdAt)}</td>
                  {canShowActions ? (
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(userItem)}
                        disabled={busy}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        Editar
                      </button>
                      ) : null}
                      {canEdit ? (
                      <button
                        type="button"
                        onClick={() => void toggleUserStatus(userItem)}
                        disabled={busy}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                      >
                        {userItem.active ? 'Desactivar' : 'Activar'}
                      </button>
                      ) : null}
                      {canDelete ? (
                      <button
                        type="button"
                        onClick={() => void removeUser(userItem)}
                        disabled={busy || user?.email?.trim().toLowerCase() === userItem.email}
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                        title="Eliminar usuario web"
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
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">{editingEmail ? 'Editar usuario web' : 'Crear usuario web'}</h3>
              <p className="text-sm text-slate-500">Configura datos del usuario, roles y permisos directos por modulo.</p>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Correo</span>
                  <input
                    type="email"
                    value={form.email}
                    disabled={editingEmail !== null}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="admin@empresa.com"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Nombre completo</span>
                  <input
                    value={form.fullName}
                    onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Contrasena {editingEmail ? '(opcional)' : ''}</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Confirmar contrasena</span>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Identificador</span>
                  <input
                    value={form.assignedPdaId}
                    onChange={(event) => setForm((current) => ({ ...current, assignedPdaId: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
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
                <p className="mb-2 text-sm font-semibold text-slate-700">Asignacion de roles</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {roles.filter((roleItem) => roleItem.active).map((roleItem) => (
                    <label key={roleItem.code} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.roleCodes.includes(roleItem.code)}
                        onChange={(event) => toggleRole(roleItem.code, event.target.checked)}
                      />
                      <span>{roleItem.name}</span>
                    </label>
                  ))}
                </div>
              </div>

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
                onClick={() => void submitUser()}
                disabled={saving || (!canCreate && editingEmail === null) || (!canEdit && editingEmail !== null)}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
              >
                {saving ? 'Guardando...' : editingEmail ? 'Guardar cambios' : 'Crear usuario web'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
