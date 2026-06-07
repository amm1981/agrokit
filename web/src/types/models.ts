export interface EventSummary {
  id: string
  name: string
  startDate: string
  endDate: string
  startAt: number
  endAt: number
  status: 'draft' | 'published' | 'closed' | 'archived'
  updatedBy: string
  updatedAt: number
}

export interface Sector {
  id: string
  name: string
  active: boolean
}

export interface GerenciaCatalogItem {
  name: string
  active: boolean
  workersCount: number
  canDelete: boolean
}

export interface SectorCatalogItem extends Sector {
  workersCount: number
  eventsCount: number
  beneficiariesCount: number
  deliveriesCount: number
  usersCount: number
  stockRowsCount: number
  canDelete: boolean
}

export interface Worker {
  dni: string
  nombreCompleto: string
  area: string
  gerencia: string
  sectorId: string
  sectorNombre: string
  eventId: string
  hasDeliveries: boolean
}

export interface KitProduct {
  id: string
  name: string
  quantity: number
}

export interface Kit {
  id: string
  name: string
  eventId: string
  products: KitProduct[]
}

export interface Delivery {
  id: string
  workerDni: string
  kitIds: string[]
  products: DeliveryProductItem[]
  timestamp: number
  photoPath: string
  pdaId: string
  userEmail: string
  eventId: string
  sectorId: string
}

export interface UserProfile {
  uid: string
  email: string
  fullName: string
  assignedPdaId: string
  role: 'admin' | 'pda'
  active: boolean
  createdAt: number
  createdBy: string
  eventId: string
  sectorIds: string[]
}

export interface ModulePermission {
  moduleKey: string
  view: boolean
  create: boolean
  edit: boolean
  delete: boolean
}

export interface WebModule {
  key: string
  label: string
}

export interface WebRole {
  code: string
  name: string
  description: string
  active: boolean
  permissions: ModulePermission[]
}

export interface WebUserProfile {
  uid: string
  email: string
  fullName: string
  assignedPdaId: string
  role: 'admin'
  active: boolean
  createdAt: number
  roleCodes: string[]
  modulePermissions: ModulePermission[]
  directModulePermissions: ModulePermission[]
}

export interface DeliveryWindow {
  enabled: boolean
  startAt: number | null
  endAt: number | null
  startDate: string
  endDate: string
  updatedAt: number
  updatedBy: string
  eventId: string
}

export interface DeliveryProductItem {
  kitCode: string
  productCode: string
  productName: string
  quantity: number
}

export interface ProductStockSummary {
  eventId: string
  productCode: string
  productName: string
  perBeneficiaryQuantity: number
  beneficiariesCount: number
  requiredQuantity: number
  stockQuantity: number
  sectorStockQuantity: number
  sectorStocks: ProductSectorStockSummary[]
  deliveredQuantity: number
  availableQuantity: number
  sufficientForBeneficiaries: boolean
}

export interface ProductSectorStockSummary {
  sectorId: string
  sectorName: string
  stockQuantity: number
}

export interface BeneficiarioRow {
  key: string
  dni: string
  nombre: string
  area: string
  gerencia: string
  sectorId: string
  sectorNombre: string
  kitId: string
  tipoKit: string
  estado: 'Entregado' | 'Pendiente'
  entregadoPor: string
  dispositivoFoto: string
  photoPath: string
}

export interface DeliveryHistoryRow {
  id: string
  workerDni: string
  workerName: string
  deliveredBy: string
  deliveredByName: string
  pdaId: string
  kitIds: string[]
  kitNames: string[]
  products: DeliveryProductItem[]
  productSummary: string
  photoPath: string
  timestamp: number
  eventId: string
  sectorId: string
}
