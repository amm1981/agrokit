import type { EventSummary, GerenciaCatalogItem, Kit, SectorCatalogItem, Worker } from '../types/models'
import { apiRequest } from './backend'

function normalizeWorker(worker: Worker): Worker {
  return {
    ...worker,
    dni: worker.dni.trim(),
    nombreCompleto: worker.nombreCompleto.trim(),
    area: worker.area.trim(),
    gerencia: worker.gerencia.trim(),
    sectorId: worker.sectorId.trim(),
    sectorNombre: worker.sectorNombre.trim(),
    eventId: worker.eventId.trim(),
  }
}

function normalizeKit(kit: Kit): Kit {
  return {
    ...kit,
    id: kit.id.trim(),
    name: kit.name.trim(),
    eventId: kit.eventId.trim(),
    products: kit.products
      .map((product) => ({
        id: product.id.trim(),
        name: product.name.trim(),
        quantity: Number(product.quantity) > 0 ? Number(product.quantity) : 1,
      }))
      .filter((product) => product.id && product.name),
  }
}

export async function upsertWorker(params: {
  worker: Worker
  eventId: string
  userEmail: string
}): Promise<void> {
  const payload = normalizeWorker(params.worker)
  if (!payload.dni || !payload.nombreCompleto) {
    throw new Error('DNI y nombre son obligatorios')
  }

  if (!payload.sectorId) {
    throw new Error('Debes seleccionar un sector para el beneficiario')
  }

  if (!params.eventId.trim()) {
    throw new Error('Debes seleccionar un evento')
  }

  await apiRequest(`/api/workers/${payload.dni}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...payload,
      centroDeCosto: payload.gerencia,
      eventId: params.eventId.trim(),
      userEmail: params.userEmail.trim().toLowerCase(),
    }),
  })
}

export async function upsertWorkersBulk(params: {
  workers: Worker[]
  eventId: string
  userEmail: string
}): Promise<number> {
  const eventId = params.eventId.trim()
  const userEmail = params.userEmail.trim().toLowerCase()

  if (!eventId) throw new Error('Debes seleccionar un evento')

  const validWorkers = params.workers
    .map(normalizeWorker)
    .filter((worker) => worker.dni && worker.nombreCompleto)
    .filter((worker) => worker.sectorId)
    .map((worker) => ({
      ...worker,
      eventId,
    }))

  if (validWorkers.length === 0) return 0

  const result = await apiRequest<{ total?: number }>('/api/workers/bulk', {
    method: 'POST',
    body: JSON.stringify({
      eventId,
      userEmail,
      workers: validWorkers.map((worker) => ({
        ...worker,
        centroDeCosto: worker.gerencia,
      })),
    }),
  })

  return Number(result.total ?? validWorkers.length)
}

export async function deleteWorkerAndDeliveries(workerDni: string, eventId: string): Promise<void> {
  const query = eventId.trim() ? `?eventId=${encodeURIComponent(eventId.trim())}` : ''
  await apiRequest(`/api/workers/${workerDni}${query}`, {
    method: 'DELETE',
  })
}

export async function listGerenciasCatalog(): Promise<GerenciaCatalogItem[]> {
  return apiRequest<GerenciaCatalogItem[]>('/api/catalog/gerencias')
}

export async function createGerenciaCatalogItem(payload: {
  name: string
  active: boolean
}): Promise<GerenciaCatalogItem> {
  return apiRequest<GerenciaCatalogItem>('/api/catalog/gerencias', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateGerenciaCatalogItem(
  currentName: string,
  payload: {
    name: string
    active: boolean
  },
): Promise<GerenciaCatalogItem> {
  return apiRequest<GerenciaCatalogItem>(`/api/catalog/gerencias/${encodeURIComponent(currentName)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteGerenciaCatalogItem(name: string): Promise<{ message?: string; action?: string }> {
  return apiRequest<{ message?: string; action?: string }>(`/api/catalog/gerencias/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

export async function listSectorsCatalog(): Promise<SectorCatalogItem[]> {
  return apiRequest<SectorCatalogItem[]>('/api/catalog/sectors')
}

export async function createSectorCatalogItem(payload: {
  id: string
  name: string
  active: boolean
  eventId?: string
}): Promise<SectorCatalogItem> {
  return apiRequest<SectorCatalogItem>('/api/catalog/sectors', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateSectorCatalogItem(
  id: string,
  payload: {
    name: string
    active: boolean
    eventId?: string
  },
): Promise<SectorCatalogItem> {
  return apiRequest<SectorCatalogItem>(`/api/catalog/sectors/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteSectorCatalogItem(id: string): Promise<{ message?: string; action?: string }> {
  return apiRequest<{ message?: string; action?: string }>(`/api/catalog/sectors/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function upsertKit(kit: Kit, eventId: string): Promise<void> {
  const payload = normalizeKit({ ...kit, eventId })
  if (!payload.id || !payload.name) {
    throw new Error('ID y nombre del kit son obligatorios')
  }

  await apiRequest(`/api/kits/${payload.id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteKit(kitId: string, eventId: string): Promise<void> {
  const query = eventId.trim() ? `?eventId=${encodeURIComponent(eventId.trim())}` : ''
  await apiRequest(`/api/kits/${kitId}${query}`, {
    method: 'DELETE',
  })
}

export async function deleteDeliveryRecord(deliveryId: string): Promise<void> {
  await apiRequest(`/api/deliveries/${deliveryId}`, {
    method: 'DELETE',
  })
}

export async function createPdaUser(params: {
  email: string
  password: string
  fullName: string
  assignedPdaId: string
  eventId: string
  sectorIds: string[]
}): Promise<void> {
  const email = params.email.trim().toLowerCase()
  const fullName = params.fullName.trim()
  const assignedPdaId = params.assignedPdaId.trim()
  const eventId = params.eventId.trim()
  const sectorIds = params.sectorIds.map((item) => item.trim()).filter(Boolean)

  if (!email || !fullName || !assignedPdaId) {
    throw new Error('Correo, nombre completo y PDA asignado son obligatorios')
  }
  if (!eventId) {
    throw new Error('Debes seleccionar un evento')
  }
  if (sectorIds.length === 0) {
    throw new Error('Debes asignar al menos un sector al usuario PDA')
  }

  await apiRequest(`/api/users/${encodeURIComponent(email)}`, {
    method: 'PUT',
    body: JSON.stringify({
      email,
      password: params.password,
      fullName,
      assignedPdaId,
      role: 'pda',
      active: true,
      eventId,
      sectorIds,
    }),
  })
}

export async function updatePdaUserProfile(
  uid: string,
  payload: Partial<{
    fullName: string
    assignedPdaId: string
    active: boolean
    eventId: string
    sectorIds: string[]
    password: string
  }>,
): Promise<void> {
  const email = uid.trim().toLowerCase()
  if (!email) {
    throw new Error('UID invalido')
  }

  const body: Record<string, unknown> = {}
  if (payload.fullName !== undefined) body.fullName = payload.fullName.trim()
  if (payload.assignedPdaId !== undefined) body.assignedPdaId = payload.assignedPdaId.trim()
  if (payload.active !== undefined) body.active = payload.active
  if (payload.eventId !== undefined) body.eventId = payload.eventId.trim()
  if (payload.sectorIds !== undefined) body.sectorIds = payload.sectorIds.map((item) => item.trim()).filter(Boolean)
  if (payload.password !== undefined) body.password = payload.password

  await apiRequest(`/api/users/${encodeURIComponent(email)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deletePdaUser(uid: string): Promise<void> {
  const email = uid.trim().toLowerCase()
  if (!email) throw new Error('UID invalido')
  await apiRequest(`/api/users/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  })
}

export async function updateDeliveryWindow(params: {
  enabled: boolean
  startDate: string
  endDate: string
  updatedBy: string
  eventId: string
}): Promise<void> {
  const startDate = params.startDate.trim()
  const endDate = params.endDate.trim()
  const eventId = params.eventId.trim()

  if (!eventId) {
    throw new Error('Debes seleccionar un evento')
  }

  if (params.enabled && (!startDate || !endDate)) {
    throw new Error('Debes configurar fecha inicio y fecha fin')
  }
  if (startDate && endDate && startDate > endDate) {
    throw new Error('La fecha de inicio no puede ser mayor a la fecha fin')
  }

  await apiRequest('/api/settings/delivery-window', {
    method: 'PUT',
    body: JSON.stringify({
      enabled: params.enabled,
      startDate,
      endDate,
      eventId,
      updatedBy: params.updatedBy.trim().toLowerCase() || 'admin',
    }),
  })
}

export async function upsertEvent(params: {
  id: string
  name: string
  startDate: string
  endDate: string
  status: EventSummary['status']
  updatedBy: string
  sectorIds: string[]
}): Promise<void> {
  const id = params.id.trim()
  const name = params.name.trim()
  const startDate = params.startDate.trim()
  const endDate = params.endDate.trim()
  const sectorIds = params.sectorIds.map((item) => item.trim()).filter(Boolean)

  if (!id || !name || !startDate || !endDate) {
    throw new Error('Completa ID, nombre y fechas del evento')
  }

  if (startDate > endDate) {
    throw new Error('La fecha de inicio no puede ser mayor a la fecha fin')
  }

  await apiRequest(`/api/events/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      id,
      name,
      startDate,
      endDate,
      status: params.status,
      updatedBy: params.updatedBy.trim().toLowerCase() || 'admin',
      sectorIds,
    }),
  })
}

export async function updateProductStock(params: {
  eventId: string
  productCode: string
  stockQuantity: number
  updatedBy: string
}): Promise<void> {
  const eventId = params.eventId.trim()
  const productCode = params.productCode.trim()
  const stockQuantity = Number(params.stockQuantity)

  if (!eventId || !productCode || !Number.isFinite(stockQuantity) || stockQuantity < 0) {
    throw new Error('Evento, producto y stock valido son requeridos')
  }

  await apiRequest(`/api/products/${encodeURIComponent(productCode)}/stock`, {
    method: 'PUT',
    body: JSON.stringify({
      eventId,
      stockQuantity,
      updatedBy: params.updatedBy.trim().toLowerCase() || 'admin',
    }),
  })
}

export async function updateProductSectorStock(params: {
  eventId: string
  productCode: string
  sectorId: string
  stockQuantity: number
  updatedBy: string
}): Promise<void> {
  const eventId = params.eventId.trim()
  const productCode = params.productCode.trim()
  const sectorId = params.sectorId.trim()
  const stockQuantity = Number(params.stockQuantity)

  if (!eventId || !productCode || !sectorId || !Number.isFinite(stockQuantity) || stockQuantity < 0) {
    throw new Error('Evento, producto, sector y stock valido son requeridos')
  }

  await apiRequest(`/api/products/${encodeURIComponent(productCode)}/sector-stock`, {
    method: 'PUT',
    body: JSON.stringify({
      eventId,
      sectorId,
      stockQuantity,
      updatedBy: params.updatedBy.trim().toLowerCase() || 'admin',
    }),
  })
}

export async function updateProductSectorStocks(params: {
  eventId: string
  productCode: string
  stocks: Array<{ sectorId: string; stockQuantity: number }>
  updatedBy: string
}): Promise<void> {
  const eventId = params.eventId.trim()
  const productCode = params.productCode.trim()
  const stocks = params.stocks
    .map((item) => ({
      sectorId: String(item.sectorId || '').trim(),
      stockQuantity: Number(item.stockQuantity),
    }))
    .filter((item) => item.sectorId)

  if (!eventId || !productCode || stocks.length === 0) {
    throw new Error('Evento, producto y stocks por sector son requeridos')
  }

  const hasInvalidQuantity = stocks.some((item) => !Number.isFinite(item.stockQuantity) || item.stockQuantity < 0)
  if (hasInvalidQuantity) {
    throw new Error('Cantidad de stock por sector invalida')
  }

  await apiRequest(`/api/products/${encodeURIComponent(productCode)}/sector-stocks`, {
    method: 'PUT',
    body: JSON.stringify({
      eventId,
      stocks,
      updatedBy: params.updatedBy.trim().toLowerCase() || 'admin',
    }),
  })
}

export async function listGerencias(): Promise<string[]> {
  const rows = await apiRequest<Array<{ name?: string; id?: string }>>('/api/gerencias')
  return rows
    .map((row) => String(row.name ?? row.id ?? '').trim())
    .filter(Boolean)
}

export async function listSecurityModules(): Promise<Array<{ key: string; label: string }>> {
  return apiRequest<Array<{ key: string; label: string }>>('/api/security/modules')
}

export async function listSecurityRoles(): Promise<Array<{
  code: string
  name: string
  description: string
  active: boolean
  permissions: Array<{ moduleKey: string; view: boolean; create: boolean; edit: boolean; delete: boolean }>
}>> {
  return apiRequest('/api/security/roles')
}

export async function upsertSecurityRole(params: {
  code: string
  name: string
  description: string
  active: boolean
  permissions: Array<{ moduleKey: string; view: boolean; create: boolean; edit: boolean; delete: boolean }>
}): Promise<void> {
  const code = params.code.trim().toLowerCase()
  if (!code) throw new Error('Codigo de rol requerido')
  if (!params.name.trim()) throw new Error('Nombre de rol requerido')

  await apiRequest(`/api/security/roles/${encodeURIComponent(code)}`, {
    method: 'PUT',
    body: JSON.stringify({
      code,
      name: params.name.trim(),
      description: params.description.trim(),
      active: params.active,
      permissions: params.permissions,
    }),
  })
}

export async function deleteSecurityRole(code: string): Promise<void> {
  const roleCode = code.trim().toLowerCase()
  if (!roleCode) throw new Error('Codigo de rol requerido')
  await apiRequest(`/api/security/roles/${encodeURIComponent(roleCode)}`, {
    method: 'DELETE',
  })
}

export async function listWebUsers(): Promise<Array<{
  uid: string
  email: string
  fullName: string
  assignedPdaId: string
  role: 'admin'
  active: boolean
  createdAt: number
  roleCodes: string[]
  modulePermissions: Array<{ moduleKey: string; view: boolean; create: boolean; edit: boolean; delete: boolean }>
  directModulePermissions: Array<{ moduleKey: string; view: boolean; create: boolean; edit: boolean; delete: boolean }>
}>> {
  return apiRequest('/api/web-users')
}

export async function upsertWebUser(params: {
  email: string
  password?: string
  fullName: string
  assignedPdaId?: string
  active: boolean
  roleCodes: string[]
  modulePermissions: Array<{ moduleKey: string; view: boolean; create: boolean; edit: boolean; delete: boolean }>
}): Promise<void> {
  const email = params.email.trim().toLowerCase()
  if (!email) throw new Error('Correo requerido')
  if (!params.fullName.trim()) throw new Error('Nombre requerido')

  await apiRequest(`/api/web-users/${encodeURIComponent(email)}`, {
    method: 'PUT',
    body: JSON.stringify({
      email,
      password: params.password,
      fullName: params.fullName.trim(),
      assignedPdaId: params.assignedPdaId?.trim() || 'ADMIN_WEB',
      active: params.active,
      roleCodes: params.roleCodes,
      modulePermissions: params.modulePermissions,
    }),
  })
}

export async function deleteWebUser(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) throw new Error('Correo requerido')
  await apiRequest(`/api/web-users/${encodeURIComponent(normalizedEmail)}`, {
    method: 'DELETE',
  })
}
