import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import mysql from 'mysql2/promise'
import jwt from 'jsonwebtoken'
import { WebSocketServer } from 'ws'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

loadDotEnvLikeFile()

const PORT = Number(process.env.PORT || 8080)
const NODE_ENV = String(process.env.NODE_ENV || 'development').trim().toLowerCase()
const IS_PRODUCTION = NODE_ENV === 'production'
const MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1'
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306)
const MYSQL_DB = process.env.MYSQL_DB || 'agrokit'
const MYSQL_USER = process.env.MYSQL_USER || 'root'
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || ''
const MYSQL_CONNECTION_LIMIT = Number(process.env.MYSQL_CONNECTION_LIMIT || 10)
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const EVIDENCE_STORAGE_DRIVER = String(process.env.EVIDENCE_STORAGE_DRIVER || 'local').trim().toLowerCase()
const EVIDENCE_STORAGE_DIR = path.resolve(process.env.EVIDENCE_STORAGE_DIR || path.resolve(process.cwd(), 'storage', 'evidencias'))
const EVIDENCE_PUBLIC_BASE = String(process.env.EVIDENCE_PUBLIC_BASE || '').trim().replace(/\/$/, '')
const S3_ENDPOINT = String(process.env.S3_ENDPOINT || '').trim()
const S3_BUCKET = String(process.env.S3_BUCKET || '').trim()
const S3_REGION = String(process.env.S3_REGION || 'us-east-1').trim()
const S3_ACCESS_KEY = String(process.env.S3_ACCESS_KEY || '').trim()
const S3_SECRET_KEY = String(process.env.S3_SECRET_KEY || '').trim()
const S3_PUBLIC_BASE_URL = String(process.env.S3_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '')
const S3_FORCE_PATH_STYLE = String(process.env.S3_FORCE_PATH_STYLE || 'true').trim().toLowerCase() !== 'false'
const JWT_SECRET = String(process.env.JWT_SECRET || 'dev_insecure_change_me').trim()
const JWT_ISSUER = String(process.env.JWT_ISSUER || 'agrokit-backend').trim()
const JWT_AUDIENCE = String(process.env.JWT_AUDIENCE || 'agrokit-system').trim()
const JWT_EXPIRATION_HOURS = Math.max(1, Number(process.env.JWT_EXPIRATION_HOURS || 8))
const JWT_EXPIRATION = `${JWT_EXPIRATION_HOURS}h`
const PDA_ALLOW_CATALOG_WRITES = String(process.env.PDA_ALLOW_CATALOG_WRITES || 'false').trim().toLowerCase() === 'true'
const FIXED_GERENCIAS = Object.freeze([
  'Gerencia Administrativa',
  'Gerencia General',
  'Gerencia Cítrico',
  'Gerencia Palto',
])
const LEGACY_GERENCIA_ALIASES = Object.freeze({
  [normalizeCatalogToken('Gerencia Cítricos')]: 'Gerencia Cítrico',
  [normalizeCatalogToken('Gerencia Paltos')]: 'Gerencia Palto',
})
const WEB_MODULES = Object.freeze([
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'eventos', label: 'Eventos' },
  { key: 'beneficiarios', label: 'Beneficiarios' },
  { key: 'entregas', label: 'Entregas' },
  { key: 'trabajadores', label: 'Trabajadores' },
  { key: 'kits', label: 'Kits' },
  { key: 'maestros', label: 'Maestros' },
  { key: 'usuarios_pda', label: 'Usuarios PDA' },
  { key: 'usuarios_web', label: 'Usuarios Web' },
])
const WEB_MODULE_KEYS = new Set(WEB_MODULES.map((item) => item.key))
const WEB_PERMISSION_ACTIONS = Object.freeze(['view', 'create', 'edit', 'delete'])

if (IS_PRODUCTION && JWT_SECRET === 'dev_insecure_change_me') {
  throw new Error('JWT_SECRET inseguro en produccion. Configura un secreto fuerte antes de iniciar.')
}

if (IS_PRODUCTION && (CORS_ORIGINS.length === 0 || CORS_ORIGINS.includes('*'))) {
  throw new Error('CORS_ORIGINS no puede ser * en produccion.')
}

if (EVIDENCE_STORAGE_DRIVER !== 's3') {
  fs.mkdirSync(EVIDENCE_STORAGE_DIR, { recursive: true })
}

const s3Client = EVIDENCE_STORAGE_DRIVER === 's3'
  ? new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT || undefined,
      forcePathStyle: S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
    })
  : null

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DB,
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: MYSQL_CONNECTION_LIMIT,
  queueLimit: 0,
})

const app = express()
app.use(cors(buildCorsOptions()))
app.use(express.json({ limit: '4mb' }))
if (EVIDENCE_STORAGE_DRIVER !== 's3') {
  app.use('/evidencias', express.static(EVIDENCE_STORAGE_DIR))
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.EVIDENCE_MAX_BYTES || 8 * 1024 * 1024),
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    callback(null, allowed.includes(String(file.mimetype || '').toLowerCase()))
  },
})

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

function wsBroadcast(event) {
  const payload = JSON.stringify(event)
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload)
    }
  })
}

wss.on('connection', (socket, req) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const token = String(requestUrl.searchParams.get('token') || '').trim()
    const auth = verifyAccessToken(token)
    socket.auth = auth
    socket.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }))
  } catch {
    socket.close(1008, 'unauthorized')
  }
})

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true, db: 'connected', ts: Date.now() })
  } catch (error) {
    res.status(500).json({ ok: false, error: toMessage(error) })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const requestedEventId = toOptionalString(req.body?.eventId || req.query?.eventId)

  if (!email || !password) {
    res.status(400).json({ message: 'email y password son requeridos' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await ensureSecurityTables(connection)
    const user = await getUserByEmail(connection, email)
    if (!user) {
      res.status(401).json({ message: 'credenciales invalidas' })
      return
    }

    if (Number(user.active || 0) !== 1) {
      res.status(403).json({ message: 'usuario inactivo' })
      return
    }

    if (!verifyPassword(password, String(user.password || ''))) {
      res.status(401).json({ message: 'credenciales invalidas' })
      return
    }
    await maybeUpgradePasswordHash(connection, user, password)

    const role = String(user.role || 'pda')
    const webRoleCodes = role === 'admin'
      ? await getWebRoleCodesByUser(connection, email)
      : []
    const webPermissions = role === 'admin'
      ? await buildEffectiveWebPermissions(connection, email, { roleFallback: true })
      : emptyPermissionMap()
    const activeEvents = await getActiveEventsForUser(connection, {
      email,
      role,
    })
    if (!activeEvents.length) {
      if (role === 'admin') {
        const token = signAccessToken({
          email: String(user.email || email),
          role,
          webRoleCodes,
          webPermissions,
          activeEventId: null,
          sectorIds: [],
        })
        const expiresAt = resolveTokenExpiration(token)

        res.json({
          email: String(user.email || email),
          fullName: String(user.full_name || ''),
          assignedPdaId: String(user.assigned_pda_id || ''),
          role,
          webRoleCodes,
          webPermissions,
          activeEvent: null,
          activeEvents: [],
          sectorIds: [],
          sectors: [],
          accessToken: token,
          tokenType: 'Bearer',
          expiresAt,
        })
        return
      }

      res.status(403).json({ message: 'No hay evento activo en este momento' })
      return
    }

    const activeEventsWithSectors = []
    for (const activeEvent of activeEvents) {
      const eventSectors = await getUserSectorsForEvent(connection, {
        email,
        role,
        eventId: String(activeEvent.id),
      })
      if (role !== 'admin' && eventSectors.length === 0) {
        continue
      }
      activeEventsWithSectors.push({
        event: activeEvent,
        sectorIds: eventSectors.map((sector) => sector.id),
        sectors: eventSectors,
      })
    }

    if (!activeEventsWithSectors.length) {
      res.status(403).json({ message: 'Usuario sin sectores asignados para eventos vigentes' })
      return
    }

    const selected = requestedEventId
      ? activeEventsWithSectors.find((item) => String(item.event.id || '') === requestedEventId)
      : activeEventsWithSectors[0]
    if (!selected) {
      res.status(403).json({ message: 'El evento seleccionado no esta vigente o no esta asignado al usuario' })
      return
    }

    const event = selected.event
    const sectors = selected.sectors

    if (role !== 'admin' && sectors.length === 0) {
      res.status(403).json({ message: 'Usuario sin sectores asignados para el evento activo' })
      return
    }

    const token = signAccessToken({
      email: String(user.email || email),
      role,
      webRoleCodes,
      webPermissions,
      activeEventId: String(event.id || ''),
      sectorIds: sectors.map((sector) => sector.id),
    })
    const expiresAt = resolveTokenExpiration(token)

    res.json({
      email: String(user.email || email),
      fullName: String(user.full_name || ''),
      assignedPdaId: String(user.assigned_pda_id || ''),
      role,
      webRoleCodes,
      webPermissions,
      activeEvent: {
        ...toEventJson(event),
        sectorIds: selected.sectorIds,
        sectors,
      },
      activeEvents: activeEventsWithSectors.map((item) => ({
        ...toEventJson(item.event),
        sectorIds: item.sectorIds,
        sectors: item.sectors,
      })),
      sectorIds: sectors.map((sector) => sector.id),
      sectors,
      accessToken: token,
      tokenType: 'Bearer',
      expiresAt,
    })
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.use('/api', authenticateApiRequest, authorizeApiRequest)

app.get('/api/events', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, start_at, end_at, status, updated_by, updated_at
       FROM events
       ORDER BY start_at DESC`,
    )

    res.json(rows.map((row) => toEventJson(row)))
  } catch (error) {
    handleApiError(res, error)
  }
})

app.get('/api/events/active', async (req, res) => {
  const eventId = toOptionalString(req.query?.eventId)
  const userEmail = resolveRequestUserEmail(req)
  const connection = await pool.getConnection()
  try {
    if (eventId) {
      const event = await getEventById(connection, eventId)
      if (!event || !isEventActiveByDate(event)) {
        res.status(404).json({ message: 'No se encontro evento activo' })
        return
      }
      res.json(toEventJson(event))
      return
    }

    let role = 'admin'
    if (userEmail) {
      const user = await getUserByEmail(connection, userEmail)
      if (!user || Number(user.active || 0) !== 1) {
        res.status(403).json({ message: 'Usuario no autorizado' })
        return
      }
      role = String(user.role || 'pda')
    }

    const events = await getActiveEventsForUser(connection, {
      email: userEmail,
      role,
    })
    res.json(events.map((event) => toEventJson(event)))
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/events/:id', async (req, res) => {
  const id = String(req.params.id || '').trim()
  const name = String(req.body?.name || '').trim()
  const startAt = parseDateBoundary(req.body?.startDate ?? req.body?.startAt, 'start')
  const endAt = parseDateBoundary(req.body?.endDate ?? req.body?.endAt, 'end')
  const status = String(req.body?.status || 'published').trim().toLowerCase()
  const updatedBy = String(req.body?.updatedBy || resolveRequestUserEmail(req) || '').trim().toLowerCase()
  const hasSectorIds = Object.prototype.hasOwnProperty.call(req.body || {}, 'sectorIds')
  const sectorIds = normalizeStringArray(req.body?.sectorIds)

  if (!id || !name || !startAt || !endAt) {
    res.status(400).json({ message: 'id, name, startDate y endDate son requeridos' })
    return
  }

  if (startAt.getTime() > endAt.getTime()) {
    res.status(400).json({ message: 'startDate no puede ser mayor que endDate' })
    return
  }

  if (!['draft', 'published', 'closed', 'archived'].includes(status)) {
    res.status(400).json({ message: 'status invalido' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    await connection.query(
      `INSERT INTO events (id, name, start_at, end_at, status, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         start_at = VALUES(start_at),
         end_at = VALUES(end_at),
         status = VALUES(status),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [id, name, startAt, endAt, status, updatedBy],
    )

    if (hasSectorIds) {
      await ensureSectorIdsBelongToCatalog(connection, sectorIds)
      await connection.query('DELETE FROM event_sectors WHERE event_id = ?', [id])
      for (const sectorId of sectorIds) {
        await connection.query(
          `INSERT INTO event_sectors (event_id, sector_id)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)`,
          [id, sectorId],
        )
      }
    }

    await connection.commit()

    const event = await getEventById(connection, id)
    const payload = toEventJson(event)
    wsBroadcast({ entity: 'events', action: 'upsert', payload, ts: Date.now() })
    wsBroadcast({
      entity: 'settings.deliveryWindow',
      action: 'upsert',
      payload: {
        enabled: payload.status === 'published',
        startAt: payload.startAt,
        endAt: payload.endAt,
        updatedAt: payload.updatedAt,
        updatedBy: payload.updatedBy,
        eventId: payload.id,
      },
      ts: Date.now(),
    })

    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/sectors', async (req, res) => {
  const eventId = toOptionalString(req.query?.eventId)

  try {
    if (eventId) {
      const [rows] = await pool.query(
        `SELECT s.id, s.name, s.active
         FROM event_sectors es
         INNER JOIN sectors s ON s.id = es.sector_id
         WHERE es.event_id = ?
         ORDER BY s.name ASC`,
        [eventId],
      )

      res.json(rows.map((row) => toSectorJson(row)))
      return
    }

    const [rows] = await pool.query(
      `SELECT id, name, active
       FROM sectors
       ORDER BY name ASC`,
    )

    res.json(rows.map((row) => toSectorJson(row)))
  } catch (error) {
    handleApiError(res, error)
  }
})

app.get('/api/gerencias', async (_req, res) => {
  const connection = await pool.getConnection()
  try {
    await ensureGerenciaCatalogTable(connection)
    const [rows] = await connection.query(
      `SELECT name
       FROM gerencias
       WHERE active = 1
       ORDER BY name ASC`,
    )
    res.json(rows.map((row) => ({ name: String(row.name || '').trim() })).filter((row) => row.name))
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/catalog/gerencias', async (_req, res) => {
  const connection = await pool.getConnection()
  try {
    await ensureGerenciaCatalogTable(connection)
    const rows = await fetchGerenciasCatalog(connection)
    res.json(rows)
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.post('/api/catalog/gerencias', async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const active = req.body?.active !== false

  const connection = await pool.getConnection()
  try {
    await ensureGerenciaCatalogTable(connection)
    await connection.beginTransaction()
    const payload = await upsertGerenciaCatalogItem(connection, { currentName: null, name, active })
    await connection.commit()
    wsBroadcast({ entity: 'gerencias', action: 'upsert', payload, ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/catalog/gerencias/:name', async (req, res) => {
  const currentName = String(req.params.name || '').trim()
  const name = String(req.body?.name || currentName).trim()
  const active = req.body?.active !== false

  const connection = await pool.getConnection()
  try {
    await ensureGerenciaCatalogTable(connection)
    await connection.beginTransaction()
    const payload = await upsertGerenciaCatalogItem(connection, { currentName, name, active })
    await connection.commit()
    wsBroadcast({ entity: 'gerencias', action: 'upsert', payload, ts: Date.now() })
    wsBroadcast({ entity: 'workers', action: 'refresh', ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.delete('/api/catalog/gerencias/:name', async (req, res) => {
  const name = String(req.params.name || '').trim()

  const connection = await pool.getConnection()
  try {
    await ensureGerenciaCatalogTable(connection)
    await connection.beginTransaction()
    const payload = await deleteGerenciaCatalogItem(connection, name)
    await connection.commit()
    wsBroadcast({ entity: 'gerencias', action: payload.action, payload, ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/catalog/sectors', async (_req, res) => {
  const connection = await pool.getConnection()
  try {
    const rows = await fetchSectorsCatalog(connection)
    res.json(rows)
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.post('/api/catalog/sectors', async (req, res) => {
  const id = String(req.body?.id || '').trim()
  const name = String(req.body?.name || '').trim()
  const active = req.body?.active !== false
  const eventId = toOptionalString(req.body?.eventId)

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const payload = await upsertSectorCatalogItem(connection, { id, name, active })
    if (eventId && payload.active !== false) {
      const event = await resolveEvent(connection, { eventId })
      await ensureSectorEnabledForEvent(connection, event.id, payload.id)
    }
    await connection.commit()
    wsBroadcast({ entity: 'sectors', action: 'upsert', payload, ts: Date.now() })
    if (eventId) wsBroadcast({ entity: 'sectors', action: 'refresh', eventId, ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/catalog/sectors/:id', async (req, res) => {
  const id = String(req.params.id || '').trim()
  const name = String(req.body?.name || '').trim()
  const active = req.body?.active !== false
  const eventId = toOptionalString(req.body?.eventId)

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const payload = await upsertSectorCatalogItem(connection, { id, name, active })
    if (eventId && payload.active !== false) {
      const event = await resolveEvent(connection, { eventId })
      await ensureSectorEnabledForEvent(connection, event.id, payload.id)
    }
    await connection.commit()
    wsBroadcast({ entity: 'sectors', action: 'upsert', payload, ts: Date.now() })
    if (eventId) wsBroadcast({ entity: 'sectors', action: 'refresh', eventId, ts: Date.now() })
    wsBroadcast({ entity: 'workers', action: 'refresh', ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.delete('/api/catalog/sectors/:id', async (req, res) => {
  const id = String(req.params.id || '').trim()

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const payload = await deleteSectorCatalogItem(connection, id)
    await connection.commit()
    wsBroadcast({ entity: 'sectors', action: payload.action, payload, ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/workers', async (req, res) => {
  const eventId = toOptionalString(req.query?.eventId)
  const userEmail = resolveRequestUserEmail(req)
  const includeDeliveries = String(req.query?.includeDeliveries || '1').trim() !== '0'

  const connection = await pool.getConnection()
  try {
    const event = await resolveEvent(connection, { eventId })
    const allowedSectorIds = await resolveAllowedSectorIds(connection, { userEmail, eventId: event.id })

    if (allowedSectorIds && allowedSectorIds.length === 0) {
      res.json([])
      return
    }

    const params = includeDeliveries ? [event.id, event.id] : [event.id]
    const sectorFilter = allowedSectorIds ? ' AND b.sector_id IN (?)' : ''
    if (allowedSectorIds) {
      params.push(allowedSectorIds)
    }

    const deliveriesJoin = includeDeliveries
      ? `LEFT JOIN (
            SELECT DISTINCT worker_dni
            FROM deliveries
            WHERE event_id = ?
          ) d ON d.worker_dni = b.worker_dni`
      : ''

    const hasDeliveriesProjection = includeDeliveries
      ? `CASE WHEN d.worker_dni IS NULL THEN 0 ELSE 1 END AS has_deliveries`
      : '0 AS has_deliveries'

    const query =
      `SELECT w.dni, w.nombre_completo, w.area, w.centro_costo, b.sector_id, s.name AS sector_name, b.event_id,
              ${hasDeliveriesProjection}
       FROM event_beneficiaries b
       INNER JOIN workers w ON w.dni = b.worker_dni
       INNER JOIN sectors s ON s.id = b.sector_id
       ${deliveriesJoin}
       WHERE b.event_id = ?
         AND b.status = 'active'${sectorFilter}
       ORDER BY w.nombre_completo ASC`

    const [rows] = await connection.query(query, params)

    res.json(
      rows.map((row) => ({
        dni: String(row.dni),
        nombreCompleto: String(row.nombre_completo || ''),
        area: String(row.area || ''),
        gerencia: String(row.centro_costo || ''),
        centroDeCosto: String(row.centro_costo || ''),
        sectorId: String(row.sector_id || ''),
        sectorNombre: String(row.sector_name || ''),
        eventId: String(row.event_id || event.id),
        hasDeliveries: Number(row.has_deliveries || 0) === 1,
      })),
    )
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/workers/lookup/:dni', async (req, res) => {
  const dni = String(req.params.dni || '').trim()
  const eventId = toOptionalString(req.query?.eventId)
  const userEmail = resolveRequestUserEmail(req)

  if (!dni) {
    res.status(400).json({ message: 'dni requerido' })
    return
  }

  const connection = await pool.getConnection()
  try {
    const event = await resolveEvent(connection, { eventId })
    const [rows] = await connection.query(
      `SELECT w.dni, w.nombre_completo, w.area, w.centro_costo, b.sector_id, s.name AS sector_name, b.event_id
       FROM event_beneficiaries b
       INNER JOIN workers w ON w.dni = b.worker_dni
       INNER JOIN sectors s ON s.id = b.sector_id
       WHERE b.event_id = ?
         AND b.worker_dni = ?
         AND b.status = 'active'
       LIMIT 1`,
      [event.id, dni],
    )
    const row = rows?.[0]
    if (!row) {
      res.json({ status: 'NOT_FOUND', worker: null })
      return
    }

    const workerPayload = {
      dni: String(row.dni || ''),
      nombreCompleto: String(row.nombre_completo || ''),
      area: String(row.area || ''),
      gerencia: String(row.centro_costo || ''),
      centroDeCosto: String(row.centro_costo || ''),
      sectorId: String(row.sector_id || ''),
      sectorNombre: String(row.sector_name || ''),
      eventId: String(row.event_id || event.id),
    }

    const [latestDeliveryRows] = await connection.query(
      `SELECT d.event_timestamp,
              d.sector_id,
              s.name AS sector_name,
              d.user_email,
              d.pda_id,
              d.event_id,
              e.name AS event_name
       FROM deliveries d
       LEFT JOIN sectors s ON s.id = d.sector_id
       LEFT JOIN events e ON e.id = d.event_id
       WHERE d.worker_dni = ?
       ORDER BY d.event_timestamp DESC
       LIMIT 1`,
      [dni],
    )
    const latestDeliveryRow = latestDeliveryRows?.[0]
    const latestDelivery = latestDeliveryRow
      ? {
          timestamp: Number(latestDeliveryRow.event_timestamp || 0),
          sectorId: String(latestDeliveryRow.sector_id || ''),
          sectorNombre: String(latestDeliveryRow.sector_name || latestDeliveryRow.sector_id || ''),
          userEmail: String(latestDeliveryRow.user_email || ''),
          pdaId: String(latestDeliveryRow.pda_id || ''),
          eventId: String(latestDeliveryRow.event_id || ''),
          eventName: String(latestDeliveryRow.event_name || latestDeliveryRow.event_id || ''),
        }
      : null

    const allowedSectorIds = await resolveAllowedSectorIds(connection, { userEmail, eventId: event.id })
    if (allowedSectorIds && !allowedSectorIds.includes(workerPayload.sectorId)) {
      res.json({ status: 'OTHER_SECTOR', worker: workerPayload, latestDelivery })
      return
    }

    res.json({ status: 'AVAILABLE', worker: workerPayload, latestDelivery })
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.post('/api/workers/bulk', async (req, res) => {
  const eventId = toOptionalString(req.body?.eventId)
  const rawWorkers = Array.isArray(req.body?.workers) ? req.body.workers : []

  if (rawWorkers.length === 0) {
    res.status(400).json({ message: 'workers requerido' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const event = await resolveEvent(connection, { eventId })
    await ensureGerenciaCatalogTable(connection)

    const [gerenciaRows] = await connection.query(
      `SELECT name
       FROM gerencias
       WHERE active = 1
       ORDER BY name ASC`,
    )
    const gerenciaByToken = new Map()
    for (const row of gerenciaRows) {
      const name = String(row.name || '').trim()
      if (name) gerenciaByToken.set(normalizeCatalogToken(name), name)
    }

    const [sectorRows] = await connection.query(
      `SELECT id, name
       FROM sectors
       WHERE active = 1
       ORDER BY name ASC`,
    )
    const sectorNameById = new Map(sectorRows.map((row) => [String(row.id || ''), String(row.name || '')]))

    const normalizedByDni = new Map()
    const invalidRows = []
    rawWorkers.forEach((raw, index) => {
      const row = raw && typeof raw === 'object' ? raw : {}
      const dni = String(row.dni || '').replace(/\D/g, '').slice(0, 8)
      const nombreCompleto = String(row.nombreCompleto || '').trim()
      const area = String(row.area || '').trim()
      const gerenciaRaw = String(row.gerencia || row.centroDeCosto || '').trim()
      const sectorId = String(row.sectorId || row.sector || '').trim()
      const resolvedGerencia = gerenciaByToken.get(normalizeCatalogToken(gerenciaRaw)) || ''

      if (!dni || !nombreCompleto) {
        invalidRows.push(`fila ${index + 1}: DNI y nombre son requeridos`)
        return
      }
      if (!resolvedGerencia) {
        invalidRows.push(`fila ${index + 1} DNI ${dni}: gerencia invalida (${gerenciaRaw || '-'})`)
        return
      }
      if (!sectorNameById.has(sectorId)) {
        invalidRows.push(`fila ${index + 1} DNI ${dni}: sector invalido (${sectorId || '-'})`)
        return
      }

      normalizedByDni.set(dni, {
        dni,
        nombreCompleto,
        area,
        gerencia: resolvedGerencia,
        sectorId,
      })
    })

    if (invalidRows.length > 0) {
      throw httpError(400, `Carga invalida. ${invalidRows.slice(0, 12).join(' | ')}`)
    }

    const normalizedWorkers = Array.from(normalizedByDni.values())
    if (normalizedWorkers.length === 0) {
      throw httpError(400, 'No hay trabajadores validos para cargar')
    }

    const sectorIdsToEnable = Array.from(new Set(normalizedWorkers.map((worker) => worker.sectorId).filter(Boolean)))
    if (sectorIdsToEnable.length > 0) {
      await connection.query(
        `INSERT IGNORE INTO event_sectors (event_id, sector_id)
         VALUES ?`,
        [sectorIdsToEnable.map((sectorId) => [event.id, sectorId])],
      )
    }

    const dniList = normalizedWorkers.map((worker) => worker.dni)
    const [lockedRows] = await connection.query(
      `SELECT DISTINCT b.worker_dni
       FROM event_beneficiaries b
       INNER JOIN deliveries d
         ON d.event_id = b.event_id
        AND d.worker_dni = b.worker_dni
       WHERE b.event_id = ?
         AND b.worker_dni IN (?)`,
      [event.id, dniList],
    )
    if (lockedRows.length > 0) {
      const lockedPreview = lockedRows.slice(0, 12).map((row) => String(row.worker_dni || '')).join(', ')
      throw httpError(
        409,
        `No se puede actualizar la carga: hay trabajadores con entregas registradas (${lockedPreview}).`,
      )
    }

    const chunkSize = 500
    for (let index = 0; index < normalizedWorkers.length; index += chunkSize) {
      const chunk = normalizedWorkers.slice(index, index + chunkSize)

      await connection.query(
        `INSERT INTO workers (dni, nombre_completo, area, centro_costo, sector_id)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           nombre_completo = VALUES(nombre_completo),
           area = VALUES(area),
           centro_costo = VALUES(centro_costo),
           sector_id = VALUES(sector_id),
           active = 1,
           updated_at = CURRENT_TIMESTAMP`,
        [chunk.map((worker) => [worker.dni, worker.nombreCompleto, worker.area, worker.gerencia, worker.sectorId])],
      )

      await connection.query(
        `INSERT INTO event_beneficiaries (event_id, worker_dni, sector_id, status)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           sector_id = VALUES(sector_id),
           status = 'active',
           updated_at = CURRENT_TIMESTAMP`,
        [chunk.map((worker) => [event.id, worker.dni, worker.sectorId, 'active'])],
      )
    }

    await connection.commit()

    wsBroadcast({ entity: 'workers', action: 'refresh', eventId: event.id, ts: Date.now() })
    wsBroadcast({ entity: 'sectors', action: 'refresh', eventId: event.id, ts: Date.now() })
    wsBroadcast({ entity: 'products.stock', action: 'refresh', eventId: event.id, ts: Date.now() })
    res.json({
      ok: true,
      total: normalizedWorkers.length,
    })
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/workers/:dni', async (req, res) => {
  const dni = String(req.params.dni || '').trim()
  const nombreCompleto = String(req.body?.nombreCompleto || '').trim()
  const area = String(req.body?.area || '').trim()
  const gerencia = String(req.body?.gerencia || req.body?.centroDeCosto || '').trim()
  const explicitSectorId = toOptionalString(req.body?.sectorId || req.body?.sector)
  const eventId = toOptionalString(req.body?.eventId)

  if (!dni || !nombreCompleto) {
    res.status(400).json({ message: 'dni y nombreCompleto son requeridos' })
    return
  }
  if (!gerencia) {
    res.status(400).json({ message: 'gerencia requerida' })
    return
  }
  if (!explicitSectorId) {
    res.status(400).json({ message: 'sectorId requerido' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const event = await resolveEvent(connection, { eventId })
    await ensureGerenciaCatalogTable(connection)
    const resolvedGerencia = await resolveCatalogGerenciaName(connection, gerencia)
    if (!resolvedGerencia) {
      throw httpError(400, `Gerencia invalida: ${gerencia}. Usa una gerencia del catalogo oficial.`)
    }
    const sectorId = explicitSectorId
    await ensureSectorEnabledForEvent(connection, event.id, sectorId)

    const [existingBeneficiaryRows] = await connection.query(
      `SELECT worker_dni
       FROM event_beneficiaries
       WHERE event_id = ?
         AND worker_dni = ?
       LIMIT 1`,
      [event.id, dni],
    )
    const alreadyAssignedToEvent = !!existingBeneficiaryRows?.[0]
    if (alreadyAssignedToEvent) {
      const [deliveryRows] = await connection.query(
        `SELECT 1
         FROM deliveries
         WHERE event_id = ?
           AND worker_dni = ?
         LIMIT 1`,
        [event.id, dni],
      )
      if (deliveryRows?.[0]) {
        throw httpError(409, 'No se puede editar el trabajador porque ya tiene entregas registradas en el evento')
      }
    }

    await connection.query(
      `INSERT INTO workers (dni, nombre_completo, area, centro_costo, sector_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nombre_completo = VALUES(nombre_completo),
         area = VALUES(area),
         centro_costo = VALUES(centro_costo),
         sector_id = VALUES(sector_id),
         active = 1,
         updated_at = CURRENT_TIMESTAMP`,
      [dni, nombreCompleto, area, resolvedGerencia, sectorId],
    )

    await connection.query(
      `INSERT INTO event_beneficiaries (event_id, worker_dni, sector_id, status)
       VALUES (?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         sector_id = VALUES(sector_id),
         status = 'active',
         updated_at = CURRENT_TIMESTAMP`,
      [event.id, dni, sectorId],
    )

    await connection.commit()

    const [sectorRows] = await connection.query('SELECT name FROM sectors WHERE id = ? LIMIT 1', [sectorId])
    const payload = {
      dni,
      nombreCompleto,
      area,
      gerencia: resolvedGerencia,
      centroDeCosto: resolvedGerencia,
      sectorId,
      sectorNombre: String(sectorRows?.[0]?.name || ''),
      eventId: event.id,
      hasDeliveries: false,
    }

    wsBroadcast({ entity: 'workers', action: 'upsert', payload, ts: Date.now() })
    wsBroadcast({ entity: 'products.stock', action: 'refresh', eventId: event.id, ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.delete('/api/workers/:dni', async (req, res) => {
  const dni = String(req.params.dni || '').trim()
  const eventId = toOptionalString(req.query?.eventId)

  if (!dni) {
    res.status(400).json({ message: 'dni requerido' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const event = await resolveEvent(connection, { eventId })
    const [deliveryRows] = await connection.query(
      `SELECT 1
       FROM deliveries
       WHERE event_id = ?
         AND worker_dni = ?
       LIMIT 1`,
      [event.id, dni],
    )
    if (deliveryRows?.[0]) {
      throw httpError(409, 'No se puede eliminar el trabajador porque ya tiene entregas registradas en el evento')
    }

    await connection.query('DELETE FROM event_beneficiaries WHERE event_id = ? AND worker_dni = ?', [event.id, dni])

    const [beneficiaryRows] = await connection.query(
      `SELECT 1
       FROM event_beneficiaries
       WHERE worker_dni = ?
       LIMIT 1`,
      [dni],
    )
    if (!beneficiaryRows?.[0]) {
      await connection.query('DELETE FROM workers WHERE dni = ?', [dni])
    }

    await connection.commit()

    wsBroadcast({ entity: 'workers', action: 'delete', id: dni, eventId: event.id, ts: Date.now() })
    wsBroadcast({ entity: 'products.stock', action: 'refresh', eventId: event.id, ts: Date.now() })

    res.json({ ok: true })
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/kits', async (req, res) => {
  const eventId = toOptionalString(req.query?.eventId)

  const connection = await pool.getConnection()
  try {
    const event = await resolveEvent(connection, { eventId })
    const kits = await fetchKitsByEvent(connection, event.id)
    res.json(kits)
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/kits/:id', async (req, res) => {
  const code = String(req.params.id || '').trim()
  const name = String(req.body?.name || '').trim()
  const eventId = toOptionalString(req.body?.eventId)
  const hasProducts = Object.prototype.hasOwnProperty.call(req.body || {}, 'products')
  const products = normalizeProducts(req.body?.products)

  if (!code || !name) {
    res.status(400).json({ message: 'id y name son requeridos' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const event = await resolveEvent(connection, { eventId })

    await connection.query(
      `INSERT INTO event_kits (event_id, code, name, status)
       VALUES (?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         status = 'active',
         updated_at = CURRENT_TIMESTAMP`,
      [event.id, code, name],
    )

    if (hasProducts) {
      await connection.query(
        'DELETE FROM event_kit_products WHERE event_id = ? AND kit_code = ?',
        [event.id, code],
      )

      for (const product of products) {
        await connection.query(
          `INSERT INTO event_kit_products (event_id, kit_code, product_code, product_name, quantity)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             product_name = VALUES(product_name),
             quantity = VALUES(quantity),
             updated_at = CURRENT_TIMESTAMP`,
          [event.id, code, product.productCode, product.productName, product.quantity],
        )
      }
    }

    await connection.commit()

    const payload = await fetchKitByCode(connection, event.id, code)
    wsBroadcast({ entity: 'kits', action: 'upsert', payload, ts: Date.now() })
    wsBroadcast({ entity: 'products.stock', action: 'refresh', eventId: event.id, ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.delete('/api/kits/:id', async (req, res) => {
  const code = String(req.params.id || '').trim()
  const eventId = toOptionalString(req.query?.eventId)

  if (!code) {
    res.status(400).json({ message: 'id requerido' })
    return
  }

  const connection = await pool.getConnection()
  try {
    const event = await resolveEvent(connection, { eventId })
    await connection.query('DELETE FROM event_kits WHERE event_id = ? AND code = ?', [event.id, code])

    wsBroadcast({ entity: 'kits', action: 'delete', id: code, eventId: event.id, ts: Date.now() })
    wsBroadcast({ entity: 'products.stock', action: 'refresh', eventId: event.id, ts: Date.now() })
    res.json({ ok: true })
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/products', async (req, res) => {
  const eventId = toOptionalString(req.query?.eventId)
  const connection = await pool.getConnection()
  try {
    const event = await resolveEvent(connection, { eventId })
    const summary = await fetchProductStockSummary(connection, event.id)
    res.json(summary)
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/products/sector-summary', async (req, res) => {
  const eventId = toOptionalString(req.query?.eventId)
  const sectorId = String(req.query?.sectorId || '').trim()
  if (!sectorId) {
    res.status(400).json({ message: 'sectorId es requerido' })
    return
  }

  const connection = await pool.getConnection()
  try {
    const event = await resolveEvent(connection, { eventId })
    await ensureSectorBelongsToEvent(connection, event.id, sectorId)
    const summary = await fetchSectorStockSummary(connection, {
      eventId: event.id,
      sectorId,
    })
    res.json(summary)
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/products/:id/stock', async (req, res) => {
  const productCode = String(req.params.id || '').trim()
  const eventId = toOptionalString(req.body?.eventId)
  const updatedBy = String(req.body?.updatedBy || resolveRequestUserEmail(req) || '').trim().toLowerCase()
  const stockQuantity = Number(req.body?.stockQuantity ?? req.body?.stock ?? NaN)

  if (!productCode || !Number.isFinite(stockQuantity) || stockQuantity < 0) {
    res.status(400).json({ message: 'productCode y stockQuantity valido son requeridos' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const event = await resolveEvent(connection, { eventId })
    await ensureProductConfiguredInEvent(connection, event.id, productCode)
    await ensureProductSectorStockTable(connection)
    const currentSectorTotal = await getProductSectorStockTotal(connection, {
      eventId: event.id,
      productCode,
    })
    if (stockQuantity + 0.000001 < currentSectorTotal) {
      throw httpError(
        400,
        `Stock general invalido para ${productCode}: no puede ser menor al total asignado por sector (${currentSectorTotal})`,
      )
    }

    await connection.query(
      `INSERT INTO product_stocks (event_id, product_code, stock_quantity, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         stock_quantity = VALUES(stock_quantity),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [event.id, productCode, stockQuantity, updatedBy],
    )

    await connection.commit()

    wsBroadcast({ entity: 'sectors', action: 'refresh', eventId: event.id, ts: Date.now() })
    const summary = await fetchProductStockSummary(connection, event.id)
    const payload = summary.find((item) => item.productCode === productCode) || null
    if (payload) {
      wsBroadcast({
        entity: 'products.stock',
        action: 'upsert',
        payload: {
          ...payload,
          eventId: event.id,
        },
        ts: Date.now(),
      })
    }

    res.json(payload || { ok: true })
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/products/:id/sector-stock', async (req, res) => {
  const productCode = String(req.params.id || '').trim()
  const sectorId = String(req.body?.sectorId || '').trim()
  const eventId = toOptionalString(req.body?.eventId)
  const updatedBy = String(req.body?.updatedBy || resolveRequestUserEmail(req) || '').trim().toLowerCase()
  const stockQuantity = Number(req.body?.stockQuantity ?? req.body?.stock ?? NaN)

  if (!productCode || !sectorId || !Number.isFinite(stockQuantity) || stockQuantity < 0) {
    res.status(400).json({ message: 'productCode, sectorId y stockQuantity valido son requeridos' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const event = await resolveEvent(connection, { eventId })
    await ensureProductConfiguredInEvent(connection, event.id, productCode)
    await ensureSectorEnabledForEvent(connection, event.id, sectorId)
    await ensureProductSectorStockTable(connection)
    const generalStockQuantity = await getProductGeneralStockQuantity(connection, {
      eventId: event.id,
      productCode,
    })
    const currentSectorTotal = await getProductSectorStockTotal(connection, {
      eventId: event.id,
      productCode,
    })
    const currentSectorQuantity = await getProductSectorStockQuantity(connection, {
      eventId: event.id,
      productCode,
      sectorId,
    })
    const nextTotal = currentSectorTotal - currentSectorQuantity + stockQuantity
    if (nextTotal > generalStockQuantity + 0.000001) {
      throw httpError(
        400,
        `Stock por sector invalido para ${productCode}: suma sectores (${nextTotal}) excede stock general (${generalStockQuantity})`,
      )
    }

    await connection.query(
      `INSERT INTO product_sector_stocks (event_id, product_code, sector_id, stock_quantity, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         stock_quantity = VALUES(stock_quantity),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [event.id, productCode, sectorId, stockQuantity, updatedBy],
    )

    await connection.commit()

    wsBroadcast({ entity: 'sectors', action: 'refresh', eventId: event.id, ts: Date.now() })
    const summary = await fetchProductStockSummary(connection, event.id)
    const payload = summary.find((item) => item.productCode === productCode) || null
    if (payload) {
      wsBroadcast({
        entity: 'products.stock',
        action: 'upsert',
        payload: {
          ...payload,
          eventId: event.id,
        },
        ts: Date.now(),
      })
    }

    res.json(payload || { ok: true })
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/products/:id/sector-stocks', async (req, res) => {
  const productCode = String(req.params.id || '').trim()
  const eventId = toOptionalString(req.body?.eventId)
  const updatedBy = String(req.body?.updatedBy || resolveRequestUserEmail(req) || '').trim().toLowerCase()
  const rawStocks = Array.isArray(req.body?.stocks) ? req.body.stocks : []

  if (!productCode) {
    res.status(400).json({ message: 'productCode requerido' })
    return
  }

  const normalizedStocks = rawStocks
    .map((item) => {
      const source = item && typeof item === 'object' ? item : {}
      const sectorId = String(source.sectorId || '').trim()
      const stockQuantity = Number(source.stockQuantity ?? source.stock ?? NaN)
      if (!sectorId || !Number.isFinite(stockQuantity) || stockQuantity < 0) return null
      return {
        sectorId,
        stockQuantity,
      }
    })
    .filter(Boolean)

  if (normalizedStocks.length === 0) {
    res.status(400).json({ message: 'stocks requeridos' })
    return
  }

  const dedupedStocks = []
  const seenSectors = new Set()
  for (const stock of normalizedStocks) {
    if (seenSectors.has(stock.sectorId)) continue
    seenSectors.add(stock.sectorId)
    dedupedStocks.push(stock)
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const event = await resolveEvent(connection, { eventId })
    await ensureProductConfiguredInEvent(connection, event.id, productCode)
    await ensureProductSectorStockTable(connection)

    for (const stock of dedupedStocks) {
      await ensureSectorEnabledForEvent(connection, event.id, stock.sectorId)
    }

    const totalBySectors = dedupedStocks.reduce((acc, item) => acc + Number(item.stockQuantity || 0), 0)
    const generalStockQuantity = await getProductGeneralStockQuantity(connection, {
      eventId: event.id,
      productCode,
    })

    if (totalBySectors > generalStockQuantity + 0.000001) {
      throw httpError(
        400,
        `Stock por sector invalido para ${productCode}: suma sectores (${totalBySectors}) excede stock general (${generalStockQuantity})`,
      )
    }

    await connection.query(
      `DELETE FROM product_sector_stocks
       WHERE event_id = ?
         AND product_code = ?`,
      [event.id, productCode],
    )

    for (const stock of dedupedStocks) {
      await connection.query(
        `INSERT INTO product_sector_stocks (event_id, product_code, sector_id, stock_quantity, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           stock_quantity = VALUES(stock_quantity),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
        [event.id, productCode, stock.sectorId, stock.stockQuantity, updatedBy],
      )
    }

    await connection.commit()

    const summary = await fetchProductStockSummary(connection, event.id)
    const payload = summary.find((item) => item.productCode === productCode) || null
    if (payload) {
      wsBroadcast({
        entity: 'products.stock',
        action: 'upsert',
        payload: {
          ...payload,
          eventId: event.id,
        },
        ts: Date.now(),
      })
    }

    res.json(payload || { ok: true })
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/deliveries', async (req, res) => {
  const eventId = toOptionalString(req.query?.eventId)
  const userEmail = resolveRequestUserEmail(req)

  const connection = await pool.getConnection()
  try {
    const event = await resolveEvent(connection, { eventId })
    const allowedSectorIds = await resolveAllowedSectorIds(connection, { userEmail, eventId: event.id })

    if (allowedSectorIds && allowedSectorIds.length === 0) {
      res.json([])
      return
    }

    let query =
      `SELECT id, event_id, worker_dni, sector_id, kit_ids_json, product_items_json, event_timestamp, photo_path, pda_id, user_email
       FROM deliveries
       WHERE event_id = ?
       ORDER BY event_timestamp DESC`
    const params = [event.id]

    if (allowedSectorIds) {
      query =
        `SELECT id, event_id, worker_dni, sector_id, kit_ids_json, product_items_json, event_timestamp, photo_path, pda_id, user_email
         FROM deliveries
         WHERE event_id = ?
           AND sector_id IN (?)
         ORDER BY event_timestamp DESC`
      params.push(allowedSectorIds)
    }

    const [rows] = await connection.query(query, params)
    res.json(rows.map((row) => toDeliveryJson(row)))
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/deliveries/:id', async (req, res) => {
  const id = String(req.params.id || '').trim()
  const workerDni = String(req.body?.workerDni || '').trim()
  const kitIds = normalizeKitIds(req.body?.kitIds)
  const deliveryProducts = normalizeDeliveryProducts(req.body?.products)
  const timestamp = Number(req.body?.timestamp || Date.now())
  const photoPath = String(req.body?.photoPath || '').trim()
  const pdaId = String(req.body?.pdaId || '').trim()
  const userEmail = resolveRequestUserEmail(req)
  const eventId = toOptionalString(req.body?.eventId)

  if (!id || !workerDni || (!kitIds.length && !deliveryProducts.length) || !userEmail) {
    res.status(400).json({ message: 'id, workerDni, userEmail y products (o kitIds) son requeridos' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const event = await resolveEvent(connection, { eventId })
    if (!isEventActiveByDate(event)) {
      throw httpError(403, 'El evento no esta vigente para registrar entregas')
    }

    const [beneficiaryRows] = await connection.query(
      `SELECT worker_dni, sector_id
       FROM event_beneficiaries
       WHERE event_id = ?
         AND worker_dni = ?
         AND status = 'active'
       LIMIT 1`,
      [event.id, workerDni],
    )
    const beneficiary = beneficiaryRows?.[0]
    if (!beneficiary) {
      throw httpError(404, 'El trabajador no esta habilitado como beneficiario en el evento activo')
    }

    await ensureUserCanOperateSector(connection, {
      userEmail,
      eventId: event.id,
      sectorId: String(beneficiary.sector_id || ''),
    })

    const normalizedTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now()

    const items = deliveryProducts.length > 0
      ? await buildDeliveryItemsFromProducts(connection, {
          eventId: event.id,
          deliveryId: id,
          products: deliveryProducts,
        })
      : await buildDeliveryItems(connection, {
          eventId: event.id,
          deliveryId: id,
          kitIds,
        })

    await ensureDeliveryStockAvailability(connection, {
      eventId: event.id,
      deliveryId: id,
      sectorId: String(beneficiary.sector_id || ''),
      items,
    })

    const normalizedKitIds = items
      .map((item) => String(item.kitCode || '').trim())
      .filter(Boolean)
      .filter((item, index, arr) => arr.indexOf(item) === index)

    const productItemsPayload = items.map((item) => ({
      kitCode: String(item.kitCode || ''),
      productCode: String(item.productCode || ''),
      productName: String(item.productName || ''),
      quantity: Number(item.quantity || 0),
    }))

    await connection.query(
      `INSERT INTO deliveries
        (id, event_id, worker_dni, sector_id, kit_ids_json, product_items_json, event_timestamp, photo_path, pda_id, user_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         event_id = VALUES(event_id),
         worker_dni = VALUES(worker_dni),
         sector_id = VALUES(sector_id),
         kit_ids_json = VALUES(kit_ids_json),
         product_items_json = VALUES(product_items_json),
         event_timestamp = VALUES(event_timestamp),
         photo_path = VALUES(photo_path),
         pda_id = VALUES(pda_id),
         user_email = VALUES(user_email),
         updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        event.id,
        workerDni,
        beneficiary.sector_id,
        JSON.stringify(normalizedKitIds),
        JSON.stringify(productItemsPayload),
        normalizedTimestamp,
        photoPath,
        pdaId,
        userEmail,
      ],
    )

    await connection.query('DELETE FROM delivery_items WHERE delivery_id = ?', [id])
    for (const item of items) {
      await connection.query(
        `INSERT INTO delivery_items
          (delivery_id, event_id, kit_code, product_code, product_name, quantity, delivered)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          id,
          event.id,
          String(item.kitCode || ''),
          item.productCode,
          item.productName,
          item.quantity,
        ],
      )
    }

    await connection.commit()

    const payload = await fetchDeliveryById(connection, id)
    wsBroadcast({ entity: 'deliveries', action: 'upsert', payload, ts: Date.now() })
    wsBroadcast({ entity: 'products.stock', action: 'refresh', eventId: event.id, ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.post('/api/deliveries/:id/evidences', upload.single('file'), async (req, res) => {
  const deliveryId = String(req.params.id || '').trim()
  const userEmail = resolveRequestUserEmail(req)

  if (!deliveryId) {
    res.status(400).json({ message: 'id requerido' })
    return
  }

  if (!req.file) {
    res.status(400).json({ message: 'Archivo de evidencia requerido en campo file' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [deliveryRows] = await connection.query(
      `SELECT id, event_id
       FROM deliveries
       WHERE id = ?
       LIMIT 1`,
      [deliveryId],
    )
    const delivery = deliveryRows?.[0]
    if (!delivery) {
      throw httpError(404, 'Entrega no encontrada')
    }

    const safeEventId = sanitizePathSegment(String(delivery.event_id || 'evento'))
    const safeDeliveryId = sanitizePathSegment(deliveryId)
    const extension = resolveEvidenceExtension(req.file.originalname, req.file.mimetype)
    const fileName = `${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}${extension}`
    const relativePath = path.posix.join(safeEventId, safeDeliveryId, fileName)
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex')
    const storedEvidence = await storeEvidenceFile({
      relativePath,
      buffer: req.file.buffer,
      mimeType: String(req.file.mimetype || '').toLowerCase(),
    })

    const [insertResult] = await connection.query(
      `INSERT INTO delivery_evidences
        (delivery_id, storage_path, public_url, mime_type, size_bytes, sha256, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        deliveryId,
        storedEvidence.storagePath,
        storedEvidence.publicUrl,
        String(req.file.mimetype || '').toLowerCase(),
        Number(req.file.size || 0),
        sha256,
        userEmail,
      ],
    )

    await connection.query(
      `UPDATE deliveries
       SET photo_path = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [storedEvidence.publicUrl, deliveryId],
    )

    await connection.commit()

    const payload = await fetchDeliveryById(connection, deliveryId)
    wsBroadcast({ entity: 'deliveries', action: 'upsert', payload, ts: Date.now() })
    wsBroadcast({ entity: 'products.stock', action: 'refresh', eventId: String(delivery.event_id || ''), ts: Date.now() })

    res.status(201).json({
      id: Number(insertResult?.insertId || 0),
      deliveryId,
      url: storedEvidence.publicUrl,
      mime: String(req.file.mimetype || '').toLowerCase(),
      size: Number(req.file.size || 0),
      sha256,
      createdAt: Date.now(),
    })
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.delete('/api/deliveries/:id', async (req, res) => {
  const deliveryId = String(req.params.id || '').trim()
  if (!deliveryId) {
    res.status(400).json({ message: 'id requerido' })
    return
  }

  try {
    const [rows] = await pool.query(
      `SELECT event_id
       FROM deliveries
       WHERE id = ?
       LIMIT 1`,
      [deliveryId],
    )
    const eventId = String(rows?.[0]?.event_id || '')

    await pool.query('DELETE FROM deliveries WHERE id = ?', [deliveryId])
    wsBroadcast({ entity: 'deliveries', action: 'delete', id: deliveryId, eventId, ts: Date.now() })
    wsBroadcast({ entity: 'products.stock', action: 'refresh', eventId, ts: Date.now() })
    res.json({ ok: true })
  } catch (error) {
    handleApiError(res, error)
  }
})

app.get('/api/evidences/:id', async (req, res) => {
  const id = Number(req.params.id || 0)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'id invalido' })
    return
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, delivery_id, storage_path, public_url, mime_type, size_bytes, sha256, uploaded_by, created_at
       FROM delivery_evidences
       WHERE id = ?
       LIMIT 1`,
      [id],
    )

    const row = rows?.[0]
    if (!row) {
      res.status(404).json({ message: 'Evidencia no encontrada' })
      return
    }

    res.json({
      id: Number(row.id),
      deliveryId: String(row.delivery_id || ''),
      storagePath: String(row.storage_path || ''),
      url: String(row.public_url || ''),
      mime: String(row.mime_type || ''),
      size: Number(row.size_bytes || 0),
      sha256: String(row.sha256 || ''),
      uploadedBy: String(row.uploaded_by || ''),
      createdAt: row.created_at ? Number(new Date(row.created_at).getTime()) : 0,
    })
  } catch (error) {
    handleApiError(res, error)
  }
})

app.get('/api/settings/delivery-window', async (req, res) => {
  const eventId = toOptionalString(req.query?.eventId)
  const connection = await pool.getConnection()
  try {
    const event = eventId ? await getEventById(connection, eventId) : await getActiveEvent(connection)

    if (!event) {
      res.json({
        enabled: false,
        startAt: null,
        endAt: null,
        startDate: null,
        endDate: null,
        updatedAt: 0,
        updatedBy: '',
      })
      return
    }

    res.json({
      enabled: String(event.status || '') === 'published',
      startAt: toDateBoundaryTimestamp(event.start_at, 'start') || null,
      endAt: toDateBoundaryTimestamp(event.end_at, 'end') || null,
      startDate: formatDateOnly(event.start_at),
      endDate: formatDateOnly(event.end_at),
      updatedAt: event.updated_at ? Number(new Date(event.updated_at).getTime()) : 0,
      updatedBy: String(event.updated_by || ''),
      eventId: String(event.id || ''),
    })
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/settings/delivery-window', async (req, res) => {
  const enabled = req.body?.enabled !== false
  const eventId = toOptionalString(req.body?.eventId)
  const startAt = parseDateBoundary(req.body?.startDate ?? req.body?.startAt, 'start')
  const endAt = parseDateBoundary(req.body?.endDate ?? req.body?.endAt, 'end')
  const updatedBy = String(req.body?.updatedBy || resolveRequestUserEmail(req) || '').trim().toLowerCase()

  if (enabled && (!startAt || !endAt)) {
    res.status(400).json({ message: 'startDate y endDate son requeridos cuando enabled=true' })
    return
  }

  if (startAt && endAt && startAt.getTime() > endAt.getTime()) {
    res.status(400).json({ message: 'startDate no puede ser mayor que endDate' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const targetEvent = eventId
      ? await getEventById(connection, eventId)
      : await getActiveEvent(connection)

    if (!targetEvent) {
      throw httpError(404, 'No se encontro evento para actualizar ventana')
    }

    await connection.query(
      `UPDATE events
       SET status = ?,
           start_at = ?,
           end_at = ?,
           updated_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        enabled ? 'published' : 'draft',
        startAt || targetEvent.start_at,
        endAt || targetEvent.end_at,
        updatedBy,
        targetEvent.id,
      ],
    )

    await connection.commit()

    const updated = await getEventById(connection, targetEvent.id)
    const payload = {
      enabled: String(updated.status || '') === 'published',
      startAt: toDateBoundaryTimestamp(updated.start_at, 'start') || null,
      endAt: toDateBoundaryTimestamp(updated.end_at, 'end') || null,
      startDate: formatDateOnly(updated.start_at),
      endDate: formatDateOnly(updated.end_at),
      updatedAt: updated.updated_at ? Number(new Date(updated.updated_at).getTime()) : 0,
      updatedBy: String(updated.updated_by || ''),
      eventId: String(updated.id || ''),
    }

    wsBroadcast({ entity: 'settings.deliveryWindow', action: 'upsert', payload, ts: Date.now() })
    wsBroadcast({ entity: 'events', action: 'upsert', payload: toEventJson(updated), ts: Date.now() })

    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/users', async (req, res) => {
  const eventId = toOptionalString(req.query?.eventId)

  const connection = await pool.getConnection()
  try {
    const event = eventId ? await getEventById(connection, eventId) : await getActiveEvent(connection)
    const scopedEventId = event ? String(event.id) : null

    let query =
      `SELECT u.email, u.full_name, u.assigned_pda_id, u.role, u.active, u.created_at
       FROM app_users u
       WHERE u.role = 'pda'
       ORDER BY u.created_at DESC`
    const params = []

    if (scopedEventId) {
      query =
        `SELECT u.email,
                u.full_name,
                u.assigned_pda_id,
                u.role,
                u.active,
                u.created_at,
                GROUP_CONCAT(ues.sector_id ORDER BY ues.sector_id SEPARATOR ',') AS sector_ids
         FROM app_users u
         LEFT JOIN user_event_sectors ues
           ON ues.user_email = u.email
          AND ues.event_id = ?
         WHERE u.role = 'pda'
         GROUP BY u.email, u.full_name, u.assigned_pda_id, u.role, u.active, u.created_at
         ORDER BY u.created_at DESC`
      params.push(scopedEventId)
    }

    const [rows] = await connection.query(query, params)

    res.json(
      rows.map((row) => ({
        uid: String(row.email),
        email: String(row.email),
        fullName: String(row.full_name || ''),
        assignedPdaId: String(row.assigned_pda_id || ''),
        role: String(row.role || 'pda'),
        active: Number(row.active || 0) === 1,
        createdAt: row.created_at ? Number(new Date(row.created_at).getTime()) : 0,
        createdBy: '',
        eventId: scopedEventId,
        sectorIds: String(row.sector_ids || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      })),
    )
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/users/:email', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const email = normalizeEmail(req.params.email)
  const hasPassword = Object.prototype.hasOwnProperty.call(body, 'password')
  const hasFullName = Object.prototype.hasOwnProperty.call(body, 'fullName')
  const hasAssignedPdaId = Object.prototype.hasOwnProperty.call(body, 'assignedPdaId')
  const hasRole = Object.prototype.hasOwnProperty.call(body, 'role')
  const hasActive = Object.prototype.hasOwnProperty.call(body, 'active')
  const hasSectorIds = Object.prototype.hasOwnProperty.call(body, 'sectorIds')
  const password = String(body.password || '').trim()
  const eventId = toOptionalString(body.eventId)
  const sectorIds = normalizeStringArray(body.sectorIds)

  if (!email) {
    res.status(400).json({ message: 'email requerido' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const existing = await getUserByEmail(connection, email)

    if (!existing && !password) {
      throw httpError(400, 'password requerido para crear usuario')
    }
    if (hasPassword && !password) {
      throw httpError(400, 'password invalido')
    }

    const finalPassword = hasPassword ? hashPassword(password) : String(existing?.password || '')
    const finalFullName = hasFullName ? String(body.fullName || '').trim() : String(existing?.full_name || '')
    const finalAssignedPdaId = hasAssignedPdaId ? String(body.assignedPdaId || '').trim() : String(existing?.assigned_pda_id || '')
    const finalRole = hasRole ? String(body.role || 'pda').trim().toLowerCase() : String(existing?.role || 'pda').trim().toLowerCase()
    const finalActive = hasActive
      ? (body.active === false ? 0 : 1)
      : (Number(existing?.active || 0) === 1 ? 1 : 0)

    await connection.query(
      `INSERT INTO app_users (email, password, full_name, assigned_pda_id, role, active)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         password = VALUES(password),
         full_name = VALUES(full_name),
         assigned_pda_id = VALUES(assigned_pda_id),
         role = VALUES(role),
         active = VALUES(active),
         updated_at = CURRENT_TIMESTAMP`,
      [email, finalPassword, finalFullName, finalAssignedPdaId, finalRole, finalActive],
    )

    let effectiveEvent = null
    if (hasSectorIds) {
      effectiveEvent = await resolveEvent(connection, { eventId })
      await ensureSectorIdsInEvent(connection, effectiveEvent.id, sectorIds)
      await connection.query('DELETE FROM user_event_sectors WHERE user_email = ? AND event_id = ?', [email, effectiveEvent.id])
      for (const sectorId of sectorIds) {
        await connection.query(
          `INSERT INTO user_event_sectors (user_email, event_id, sector_id)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             user_email = VALUES(user_email)`,
          [email, effectiveEvent.id, sectorId],
        )
      }
    }

    await connection.commit()

    const payload = {
      uid: email,
      email,
      fullName: finalFullName,
      assignedPdaId: finalAssignedPdaId,
      role: finalRole,
      active: finalActive === 1,
      createdBy: '',
      eventId: effectiveEvent?.id || null,
      sectorIds,
    }

    wsBroadcast({ entity: 'users', action: 'upsert', payload, ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/security/modules', async (_req, res) => {
  res.json(WEB_MODULES)
})

app.get('/api/security/roles', async (_req, res) => {
  const connection = await pool.getConnection()
  try {
    await ensureSecurityTables(connection)
    const [roleRows] = await connection.query(
      `SELECT code, name, description, active
       FROM web_roles
       ORDER BY name ASC`,
    )
    const [permissionRows] = await connection.query(
      `SELECT role_code, module_key, can_view, can_create, can_edit, can_delete
       FROM web_role_permissions`,
    )

    const permissionsByRole = new Map()
    for (const row of permissionRows) {
      const roleCode = String(row.role_code || '').trim().toLowerCase()
      if (!roleCode) continue
      const list = permissionsByRole.get(roleCode) || []
      list.push({
        moduleKey: String(row.module_key || '').trim().toLowerCase(),
        view: Number(row.can_view || 0) === 1,
        create: Number(row.can_create || 0) === 1,
        edit: Number(row.can_edit || 0) === 1,
        delete: Number(row.can_delete || 0) === 1,
      })
      permissionsByRole.set(roleCode, list)
    }

    res.json(
      roleRows.map((row) => {
        const code = String(row.code || '').trim().toLowerCase()
        return {
          code,
          name: String(row.name || '').trim(),
          description: String(row.description || '').trim(),
          active: Number(row.active || 0) === 1,
          permissions: permissionsByRole.get(code) || [],
        }
      }),
    )
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/security/roles/:code', async (req, res) => {
  const code = normalizeRoleCode(req.params.code)
  const name = String(req.body?.name || '').trim()
  const description = String(req.body?.description || '').trim()
  const active = req.body?.active === false ? 0 : 1
  const permissions = normalizeModulePermissionsInput(req.body?.permissions)

  if (!code || !name) {
    res.status(400).json({ message: 'code y name son requeridos' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await ensureSecurityTables(connection)

    await connection.query(
      `INSERT INTO web_roles (code, name, description, active)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         description = VALUES(description),
         active = VALUES(active),
         updated_at = CURRENT_TIMESTAMP`,
      [code, name, description, active],
    )

    await connection.query('DELETE FROM web_role_permissions WHERE role_code = ?', [code])
    for (const permission of permissions) {
      await connection.query(
        `INSERT INTO web_role_permissions (role_code, module_key, can_view, can_create, can_edit, can_delete)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          code,
          permission.moduleKey,
          permission.view ? 1 : 0,
          permission.create ? 1 : 0,
          permission.edit ? 1 : 0,
          permission.delete ? 1 : 0,
        ],
      )
    }

    await connection.commit()
    res.json({
      code,
      name,
      description,
      active: active === 1,
      permissions,
    })
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.delete('/api/security/roles/:code', async (req, res) => {
  const code = normalizeRoleCode(req.params.code)
  if (!code) {
    res.status(400).json({ message: 'code requerido' })
    return
  }
  if (code === 'super_admin') {
    res.status(400).json({ message: 'No se puede eliminar el rol super_admin' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await ensureSecurityTables(connection)

    const [rows] = await connection.query(
      `SELECT code
       FROM web_roles
       WHERE code = ?
       LIMIT 1`,
      [code],
    )
    if (!rows?.[0]) {
      throw httpError(404, 'Rol no encontrado')
    }

    await connection.query('DELETE FROM web_roles WHERE code = ?', [code])
    await connection.commit()

    wsBroadcast({ entity: 'security.roles', action: 'delete', id: code, ts: Date.now() })
    res.json({ ok: true, code })
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.get('/api/web-users', async (_req, res) => {
  const connection = await pool.getConnection()
  try {
    await ensureSecurityTables(connection)

    const [userRows] = await connection.query(
      `SELECT u.email, u.full_name, u.assigned_pda_id, u.active, u.created_at
       FROM app_users u
       WHERE u.role = 'admin'
       ORDER BY u.created_at DESC`,
    )

    const [roleRows] = await connection.query(
      `SELECT user_email, role_code
       FROM web_user_roles
       ORDER BY role_code ASC`,
    )
    const roleCodesByUser = new Map()
    for (const row of roleRows) {
      const email = String(row.user_email || '').trim().toLowerCase()
      const roleCode = String(row.role_code || '').trim().toLowerCase()
      if (!email || !roleCode) continue
      const list = roleCodesByUser.get(email) || []
      list.push(roleCode)
      roleCodesByUser.set(email, list)
    }

    const [directPermissionRows] = await connection.query(
      `SELECT user_email, module_key, can_view, can_create, can_edit, can_delete
       FROM web_user_permissions`,
    )
    const directPermissionsByUser = new Map()
    for (const row of directPermissionRows) {
      const email = String(row.user_email || '').trim().toLowerCase()
      const moduleKey = String(row.module_key || '').trim().toLowerCase()
      if (!email || !moduleKey) continue
      const list = directPermissionsByUser.get(email) || []
      list.push({
        moduleKey,
        view: Number(row.can_view || 0) === 1,
        create: Number(row.can_create || 0) === 1,
        edit: Number(row.can_edit || 0) === 1,
        delete: Number(row.can_delete || 0) === 1,
      })
      directPermissionsByUser.set(email, list)
    }

    const payload = []
    for (const row of userRows) {
      const email = String(row.email || '').trim().toLowerCase()
      const effectivePermissions = await buildEffectiveWebPermissions(connection, email, { roleFallback: true })
      payload.push({
        uid: email,
        email,
        fullName: String(row.full_name || '').trim(),
        role: 'admin',
        assignedPdaId: String(row.assigned_pda_id || '').trim(),
        active: Number(row.active || 0) === 1,
        createdAt: row.created_at ? Number(new Date(row.created_at).getTime()) : 0,
        roleCodes: roleCodesByUser.get(email) || [],
        modulePermissions: WEB_MODULES.map((moduleItem) => ({
          moduleKey: moduleItem.key,
          ...effectivePermissions[moduleItem.key],
        })),
        directModulePermissions: directPermissionsByUser.get(email) || [],
      })
    }

    res.json(payload)
  } catch (error) {
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.put('/api/web-users/:email', async (req, res) => {
  const email = normalizeEmail(req.params.email)
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const hasPassword = Object.prototype.hasOwnProperty.call(body, 'password')
  const hasFullName = Object.prototype.hasOwnProperty.call(body, 'fullName')
  const hasAssignedPdaId = Object.prototype.hasOwnProperty.call(body, 'assignedPdaId')
  const hasActive = Object.prototype.hasOwnProperty.call(body, 'active')
  const password = String(body.password || '').trim()
  const roleCodes = Array.isArray(body.roleCodes)
    ? body.roleCodes.map((item) => normalizeRoleCode(item)).filter(Boolean)
    : []
  const directPermissions = normalizeModulePermissionsInput(body.modulePermissions)

  if (!email) {
    res.status(400).json({ message: 'email requerido' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await ensureSecurityTables(connection)

    const existing = await getUserByEmail(connection, email)
    if (!existing && !hasPassword) {
      throw httpError(400, 'password requerido para crear usuario web')
    }
    if (hasPassword && !password) {
      throw httpError(400, 'password invalido')
    }

    const finalPassword = hasPassword ? hashPassword(password) : String(existing?.password || '')
    const finalFullName = hasFullName ? String(body.fullName || '').trim() : String(existing?.full_name || '')
    const finalAssignedPdaId = hasAssignedPdaId ? String(body.assignedPdaId || '').trim() : String(existing?.assigned_pda_id || 'ADMIN_WEB')
    const finalActive = hasActive
      ? (body.active === false ? 0 : 1)
      : (Number(existing?.active || 0) === 1 ? 1 : 0)

    await connection.query(
      `INSERT INTO app_users (email, password, full_name, assigned_pda_id, role, active)
       VALUES (?, ?, ?, ?, 'admin', ?)
       ON DUPLICATE KEY UPDATE
         password = VALUES(password),
         full_name = VALUES(full_name),
         assigned_pda_id = VALUES(assigned_pda_id),
         role = 'admin',
         active = VALUES(active),
         updated_at = CURRENT_TIMESTAMP`,
      [email, finalPassword, finalFullName, finalAssignedPdaId, finalActive],
    )

    const validRoleCodes = []
    if (roleCodes.length > 0) {
      const [rows] = await connection.query(
        `SELECT code
         FROM web_roles
         WHERE active = 1
           AND code IN (?)`,
        [roleCodes],
      )
      validRoleCodes.push(
        ...rows
          .map((row) => String(row.code || '').trim().toLowerCase())
          .filter(Boolean),
      )
      const missing = roleCodes.filter((roleCode) => !validRoleCodes.includes(roleCode))
      if (missing.length > 0) {
        throw httpError(400, `Roles no encontrados: ${missing.join(', ')}`)
      }
    }

    await connection.query('DELETE FROM web_user_roles WHERE user_email = ?', [email])
    for (const roleCode of validRoleCodes) {
      await connection.query(
        `INSERT INTO web_user_roles (user_email, role_code)
         VALUES (?, ?)`,
        [email, roleCode],
      )
    }

    await connection.query('DELETE FROM web_user_permissions WHERE user_email = ?', [email])
    for (const permission of directPermissions) {
      await connection.query(
        `INSERT INTO web_user_permissions (user_email, module_key, can_view, can_create, can_edit, can_delete)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          email,
          permission.moduleKey,
          permission.view ? 1 : 0,
          permission.create ? 1 : 0,
          permission.edit ? 1 : 0,
          permission.delete ? 1 : 0,
        ],
      )
    }

    await connection.commit()

    const effectivePermissions = await buildEffectiveWebPermissions(connection, email, { roleFallback: false })
    const payload = {
      uid: email,
      email,
      fullName: finalFullName,
      role: 'admin',
      assignedPdaId: finalAssignedPdaId,
      active: finalActive === 1,
      roleCodes: validRoleCodes,
      modulePermissions: WEB_MODULES.map((moduleItem) => ({
        moduleKey: moduleItem.key,
        ...effectivePermissions[moduleItem.key],
      })),
      directModulePermissions: directPermissions,
    }

    wsBroadcast({ entity: 'webUsers', action: 'upsert', payload, ts: Date.now() })
    res.json(payload)
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.delete('/api/web-users/:email', async (req, res) => {
  const email = normalizeEmail(req.params.email)
  if (!email) {
    res.status(400).json({ message: 'email requerido' })
    return
  }

  const requester = normalizeEmail(req.auth?.email)
  if (requester && requester === email) {
    res.status(400).json({ message: 'No puedes eliminar tu propio usuario web' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await ensureSecurityTables(connection)

    const existing = await getUserByEmail(connection, email)
    if (!existing || String(existing.role || '').trim().toLowerCase() !== 'admin') {
      throw httpError(404, 'Usuario web no encontrado')
    }

    await connection.query('DELETE FROM web_user_permissions WHERE user_email = ?', [email])
    await connection.query('DELETE FROM web_user_roles WHERE user_email = ?', [email])
    await connection.query('DELETE FROM user_event_sectors WHERE user_email = ?', [email])
    await connection.query('DELETE FROM app_users WHERE email = ? AND role = ?', [email, 'admin'])

    await connection.commit()
    wsBroadcast({ entity: 'webUsers', action: 'delete', id: email, ts: Date.now() })
    res.json({ ok: true, email })
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

app.delete('/api/users/:email', async (req, res) => {
  const email = normalizeEmail(req.params.email)
  if (!email) {
    res.status(400).json({ message: 'email requerido' })
    return
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const existing = await getUserByEmail(connection, email)
    if (!existing || String(existing.role || '').trim().toLowerCase() !== 'pda') {
      throw httpError(404, 'Usuario PDA no encontrado')
    }

    await connection.query('DELETE FROM user_event_sectors WHERE user_email = ?', [email])
    await connection.query('DELETE FROM app_users WHERE email = ? AND role = ?', [email, 'pda'])

    await connection.commit()
    wsBroadcast({ entity: 'users', action: 'delete', id: email, ts: Date.now() })
    res.json({ ok: true, email })
  } catch (error) {
    await connection.rollback()
    handleApiError(res, error)
  } finally {
    connection.release()
  }
})

server.listen(PORT, () => {
  console.log(`[AgroKit backend] REST: http://0.0.0.0:${PORT}/api`)
  console.log(`[AgroKit backend] WS:   ws://0.0.0.0:${PORT}/ws`)
  console.log(`[AgroKit backend] Evidence driver: ${EVIDENCE_STORAGE_DRIVER}`)
  console.log(`[AgroKit backend] Files: ${EVIDENCE_STORAGE_DRIVER === 's3' ? `${S3_BUCKET} @ ${S3_ENDPOINT}` : `http://0.0.0.0:${PORT}/evidencias/*`}`)
  console.log(`[AgroKit backend] Storage: ${EVIDENCE_STORAGE_DRIVER === 's3' ? S3_PUBLIC_BASE_URL || S3_BUCKET : EVIDENCE_STORAGE_DIR}`)
  console.log(`[AgroKit backend] JWT expira en ${JWT_EXPIRATION}`)
  console.log(`[AgroKit backend] MySQL ${MYSQL_USER}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DB}`)
  if (JWT_SECRET === 'dev_insecure_change_me') {
    console.warn('[AgroKit backend] ADVERTENCIA: JWT_SECRET no configurado. Define un secreto fuerte en .env.')
  }
})

void warmupReadIndexes()

function buildCorsOptions() {
  if (CORS_ORIGINS.length === 0 || CORS_ORIGINS.includes('*')) {
    return {}
  }

  return {
    origin(origin, callback) {
      if (!origin || CORS_ORIGINS.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error(`Origen no permitido por CORS: ${origin}`))
    },
  }
}

async function warmupReadIndexes() {
  const connection = await pool.getConnection()
  try {
    await ensureSecurityTables(connection)
    await ensureWorkersReadIndexes(connection)
  } catch (error) {
    console.error(`[AgroKit backend] No se pudieron validar indices de lectura: ${toMessage(error)}`)
  } finally {
    connection.release()
  }
}

async function ensureWorkersReadIndexes(connection) {
  const [beneficiaryStatusIdx] = await connection.query(
    `SHOW INDEX FROM event_beneficiaries WHERE Key_name = 'idx_event_beneficiaries_event_status_sector_worker'`,
  )
  if (!Array.isArray(beneficiaryStatusIdx) || beneficiaryStatusIdx.length === 0) {
    await connection.query(
      `CREATE INDEX idx_event_beneficiaries_event_status_sector_worker
       ON event_beneficiaries (event_id, status, sector_id, worker_dni)`,
    )
  }

  const [workersNameIdx] = await connection.query(
    `SHOW INDEX FROM workers WHERE Key_name = 'idx_workers_nombre_completo'`,
  )
  if (!Array.isArray(workersNameIdx) || workersNameIdx.length === 0) {
    await connection.query(
      `CREATE INDEX idx_workers_nombre_completo
       ON workers (nombre_completo)`,
    )
  }
}

function toMessage(error) {
  if (error instanceof Error) return error.message
  return String(error || 'Error desconocido')
}

function httpError(status, message) {
  const error = new Error(message)
  error.statusCode = status
  return error
}

function resolveRequestUserEmail(req) {
  const fromToken = normalizeEmail(req?.auth?.email)
  if (fromToken) return fromToken
  const fromBody = normalizeEmail(req?.body?.userEmail)
  if (fromBody) return fromBody
  return normalizeEmail(req?.query?.userEmail)
}

function authenticateApiRequest(req, res, next) {
  const authHeader = String(req.headers?.authorization || '').trim()
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ message: 'Token requerido (Authorization: Bearer <token>)' })
    return
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    res.status(401).json({ message: 'Token invalido' })
    return
  }

  try {
    req.auth = verifyAccessToken(token)
    next()
  } catch (error) {
    res.status(401).json({ message: toMessage(error) || 'Token invalido o expirado' })
  }
}

function authorizeApiRequest(req, res, next) {
  const auth = req.auth
  if (!auth?.email) {
    res.status(401).json({ message: 'Sesion invalida' })
    return
  }

  const pathname = String(req.path || '/').trim().toLowerCase()
  const method = String(req.method || 'GET').trim().toUpperCase()

  if (auth.role === 'pda') {
    if (!isPdaApiAllowed({ pathname, method })) {
      res.status(403).json({ message: 'Sin permisos para esta operacion' })
      return
    }
    next()
    return
  }

  if (auth.role !== 'admin') {
    res.status(403).json({ message: 'Rol no autorizado para este API' })
    return
  }

  if (!hasAnyViewPermission(auth.webPermissions)) {
    res.status(403).json({ message: 'Usuario sin modulos asignados para el panel web' })
    return
  }

  const requiredModule = resolveModuleForPath(pathname)
  const action = resolveActionByMethod(method)
  if (!requiredModule) {
    next()
    return
  }

  if (!hasModulePermission(auth.webPermissions, requiredModule, action)) {
    res.status(403).json({ message: `Sin permiso ${action} en modulo ${requiredModule}` })
    return
  }

  next()
}

function isPdaApiAllowed({ pathname, method }) {
  if (method === 'GET' && (
    pathname === '/events' ||
    pathname === '/events/active' ||
    pathname === '/sectors' ||
    pathname === '/workers' ||
    pathname.startsWith('/workers/lookup/') ||
    pathname === '/kits' ||
    pathname === '/products' ||
    pathname === '/products/sector-summary' ||
    pathname === '/deliveries' ||
    pathname === '/settings/delivery-window' ||
    pathname.startsWith('/evidences/')
  )) {
    return true
  }

  if (method === 'PUT' && pathname.startsWith('/deliveries/')) {
    return true
  }

  if (PDA_ALLOW_CATALOG_WRITES && method === 'PUT' && (
    pathname.startsWith('/workers/') ||
    pathname.startsWith('/kits/')
  )) {
    return true
  }

  if (method === 'POST' && pathname.startsWith('/deliveries/') && pathname.endsWith('/evidences')) {
    return true
  }

  return false
}

function resolveActionByMethod(method) {
  if (method === 'GET') return 'view'
  if (method === 'POST') return 'create'
  if (method === 'DELETE') return 'delete'
  return 'edit'
}

function resolveModuleForPath(pathname) {
  if (pathname === '/events' || pathname === '/events/active' || pathname.startsWith('/events/')) return 'eventos'
  if (pathname === '/workers' || pathname.startsWith('/workers/')) return 'trabajadores'
  if (pathname === '/kits' || pathname.startsWith('/kits/')) return 'kits'
  if (pathname === '/products' || pathname.startsWith('/products/')) return 'kits'
  if (pathname === '/deliveries' || pathname.startsWith('/deliveries/')) return 'entregas'
  if (pathname.startsWith('/evidences/')) return 'entregas'
  if (pathname === '/settings/delivery-window') return 'entregas'
  if (pathname === '/catalog/gerencias' || pathname.startsWith('/catalog/gerencias/')) return 'maestros'
  if (pathname === '/catalog/sectors' || pathname.startsWith('/catalog/sectors/')) return 'maestros'
  if (pathname === '/users' || pathname.startsWith('/users/')) return 'usuarios_pda'
  if (pathname === '/web-users' || pathname.startsWith('/web-users/')) return 'usuarios_web'
  if (pathname === '/security/modules' || pathname === '/security/roles' || pathname.startsWith('/security/roles/')) return 'usuarios_web'
  return null
}

function emptyPermissionMap() {
  const map = {}
  WEB_MODULES.forEach((item) => {
    map[item.key] = {
      view: false,
      create: false,
      edit: false,
      delete: false,
    }
  })
  return map
}

function fullPermissionMap() {
  const map = {}
  WEB_MODULES.forEach((item) => {
    map[item.key] = {
      view: true,
      create: true,
      edit: true,
      delete: true,
    }
  })
  return map
}

function normalizePermissionMap(raw) {
  const base = emptyPermissionMap()
  if (!raw || typeof raw !== 'object') return base

  WEB_MODULES.forEach((moduleItem) => {
    const source = raw[moduleItem.key]
    if (!source || typeof source !== 'object') return
    base[moduleItem.key] = {
      view: source.view === true,
      create: source.create === true,
      edit: source.edit === true,
      delete: source.delete === true,
    }
  })

  return base
}

function hasAnyViewPermission(permissions) {
  const normalized = normalizePermissionMap(permissions)
  return WEB_MODULES.some((moduleItem) => normalized[moduleItem.key]?.view === true)
}

function hasModulePermission(permissions, moduleKey, action) {
  if (!WEB_MODULE_KEYS.has(moduleKey)) return false
  if (!WEB_PERMISSION_ACTIONS.includes(action)) return false
  const normalized = normalizePermissionMap(permissions)
  return normalized[moduleKey]?.[action] === true
}

function normalizeRoleCode(rawValue) {
  return String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

function normalizeModulePermissionsInput(rawValue) {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => {
      const source = item && typeof item === 'object' ? item : {}
      const moduleKey = String(source.moduleKey || source.module || '').trim().toLowerCase()
      if (!WEB_MODULE_KEYS.has(moduleKey)) return null
      return {
        moduleKey,
        view: source.view === true,
        create: source.create === true,
        edit: source.edit === true,
        delete: source.delete === true,
      }
    })
    .filter(Boolean)
}

function permissionRowsToMap(rows) {
  const map = emptyPermissionMap()
  for (const row of rows || []) {
    const moduleKey = String(row.module_key || '').trim().toLowerCase()
    if (!WEB_MODULE_KEYS.has(moduleKey)) continue
    map[moduleKey] = {
      view: Number(row.can_view || 0) === 1,
      create: Number(row.can_create || 0) === 1,
      edit: Number(row.can_edit || 0) === 1,
      delete: Number(row.can_delete || 0) === 1,
    }
  }
  return map
}

function mergePermissionMaps(baseMap, patchMap) {
  const base = normalizePermissionMap(baseMap)
  const patch = normalizePermissionMap(patchMap)
  const merged = emptyPermissionMap()

  WEB_MODULES.forEach((moduleItem) => {
    const key = moduleItem.key
    merged[key] = {
      view: base[key].view || patch[key].view,
      create: base[key].create || patch[key].create,
      edit: base[key].edit || patch[key].edit,
      delete: base[key].delete || patch[key].delete,
    }
  })

  return merged
}

async function getWebRoleCodesByUser(connection, userEmail) {
  const normalizedEmail = normalizeEmail(userEmail)
  if (!normalizedEmail) return []
  const [rows] = await connection.query(
    `SELECT wur.role_code
     FROM web_user_roles wur
     INNER JOIN web_roles wr ON wr.code = wur.role_code
     WHERE wur.user_email = ?
       AND wr.active = 1
     ORDER BY wur.role_code ASC`,
    [normalizedEmail],
  )
  return rows
    .map((row) => String(row.role_code || '').trim().toLowerCase())
    .filter(Boolean)
}

async function buildEffectiveWebPermissions(connection, userEmail, options = {}) {
  const normalizedEmail = normalizeEmail(userEmail)
  if (!normalizedEmail) return emptyPermissionMap()

  const roleCodes = await getWebRoleCodesByUser(connection, normalizedEmail)
  let fromRoles = emptyPermissionMap()
  if (roleCodes.length > 0) {
    const [rolePermissionRows] = await connection.query(
      `SELECT module_key, can_view, can_create, can_edit, can_delete
       FROM web_role_permissions
       WHERE role_code IN (?)`,
      [roleCodes],
    )
    fromRoles = permissionRowsToMap(rolePermissionRows)
  }

  const [directRows] = await connection.query(
    `SELECT module_key, can_view, can_create, can_edit, can_delete
     FROM web_user_permissions
     WHERE user_email = ?`,
    [normalizedEmail],
  )
  const directMap = permissionRowsToMap(directRows)

  let effective = mergePermissionMaps(fromRoles, directMap)
  const roleFallback = options?.roleFallback === true
  if (roleFallback && roleCodes.length === 0 && !hasAnyViewPermission(effective)) {
    effective = fullPermissionMap()
  }

  return effective
}

function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: JWT_EXPIRATION,
  })
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  })

  const roleRaw = String(decoded.role || 'pda').trim().toLowerCase()
  const role = roleRaw === 'admin' ? 'admin' : 'pda'
  return {
    email: normalizeEmail(decoded.email || decoded.sub),
    role,
    webRoleCodes: Array.isArray(decoded.webRoleCodes)
      ? decoded.webRoleCodes.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [],
    webPermissions: normalizePermissionMap(decoded.webPermissions),
    activeEventId: String(decoded.activeEventId || '').trim(),
    sectorIds: Array.isArray(decoded.sectorIds)
      ? decoded.sectorIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    exp: Number(decoded.exp || 0),
  }
}

function resolveTokenExpiration(token) {
  const decoded = jwt.decode(token)
  const expSeconds = Number(decoded?.exp || 0)
  if (!Number.isFinite(expSeconds) || expSeconds <= 0) {
    return Date.now() + JWT_EXPIRATION_HOURS * 60 * 60 * 1000
  }
  return expSeconds * 1000
}

function isPasswordHash(value) {
  return String(value || '').startsWith('pbkdf2$')
}

function hashPassword(rawPassword) {
  const raw = String(rawPassword || '')
  if (raw.length < 6) {
    throw httpError(400, 'La contrasena debe tener al menos 6 caracteres')
  }
  const iterations = 120000
  const salt = crypto.randomBytes(16).toString('hex')
  const digest = crypto.pbkdf2Sync(raw, salt, iterations, 32, 'sha256').toString('hex')
  return `pbkdf2$${iterations}$${salt}$${digest}`
}

function verifyPassword(rawPassword, storedValue) {
  const raw = String(rawPassword || '')
  const stored = String(storedValue || '')
  if (!isPasswordHash(stored)) {
    return stored === raw
  }

  const parts = stored.split('$')
  if (parts.length !== 4) return false
  const iterations = Number(parts[1] || 0)
  const salt = String(parts[2] || '')
  const digest = String(parts[3] || '')
  if (!Number.isFinite(iterations) || iterations <= 0 || !salt || !digest) return false

  const incomingDigest = crypto.pbkdf2Sync(raw, salt, iterations, 32, 'sha256').toString('hex')
  const incomingBuffer = Buffer.from(incomingDigest, 'hex')
  const storedBuffer = Buffer.from(digest, 'hex')
  if (incomingBuffer.length !== storedBuffer.length) return false
  return crypto.timingSafeEqual(incomingBuffer, storedBuffer)
}

async function maybeUpgradePasswordHash(connection, user, plainPassword) {
  const stored = String(user?.password || '')
  if (!stored || isPasswordHash(stored)) return
  if (!verifyPassword(plainPassword, stored)) return

  const upgraded = hashPassword(plainPassword)
  await connection.query(
    `UPDATE app_users
     SET password = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE email = ?`,
    [upgraded, String(user.email || '').trim().toLowerCase()],
  )
}

async function ensureSecurityTables(connection) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS web_roles (
      code VARCHAR(80) NOT NULL,
      name VARCHAR(160) NOT NULL,
      description VARCHAR(255) NOT NULL DEFAULT '',
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (code)
    ) ENGINE=InnoDB`,
  )

  await connection.query(
    `CREATE TABLE IF NOT EXISTS web_role_permissions (
      role_code VARCHAR(80) NOT NULL,
      module_key VARCHAR(80) NOT NULL,
      can_view TINYINT(1) NOT NULL DEFAULT 0,
      can_create TINYINT(1) NOT NULL DEFAULT 0,
      can_edit TINYINT(1) NOT NULL DEFAULT 0,
      can_delete TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (role_code, module_key),
      CONSTRAINT fk_web_role_permissions_role
        FOREIGN KEY (role_code)
        REFERENCES web_roles (code)
        ON DELETE CASCADE
    ) ENGINE=InnoDB`,
  )

  await connection.query(
    `CREATE TABLE IF NOT EXISTS web_user_roles (
      user_email VARCHAR(200) NOT NULL,
      role_code VARCHAR(80) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_email, role_code),
      CONSTRAINT fk_web_user_roles_user
        FOREIGN KEY (user_email)
        REFERENCES app_users (email)
        ON DELETE CASCADE,
      CONSTRAINT fk_web_user_roles_role
        FOREIGN KEY (role_code)
        REFERENCES web_roles (code)
        ON DELETE CASCADE
    ) ENGINE=InnoDB`,
  )

  await connection.query(
    `CREATE TABLE IF NOT EXISTS web_user_permissions (
      user_email VARCHAR(200) NOT NULL,
      module_key VARCHAR(80) NOT NULL,
      can_view TINYINT(1) NOT NULL DEFAULT 0,
      can_create TINYINT(1) NOT NULL DEFAULT 0,
      can_edit TINYINT(1) NOT NULL DEFAULT 0,
      can_delete TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_email, module_key),
      CONSTRAINT fk_web_user_permissions_user
        FOREIGN KEY (user_email)
        REFERENCES app_users (email)
        ON DELETE CASCADE
    ) ENGINE=InnoDB`,
  )

  await connection.query(
    `INSERT INTO web_roles (code, name, description, active)
     VALUES ('super_admin', 'Super Admin', 'Acceso completo al panel web', 1)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       description = VALUES(description),
       active = VALUES(active),
       updated_at = CURRENT_TIMESTAMP`,
  )

  for (const moduleItem of WEB_MODULES) {
    await connection.query(
      `INSERT INTO web_role_permissions (role_code, module_key, can_view, can_create, can_edit, can_delete)
       VALUES ('super_admin', ?, 1, 1, 1, 1)
       ON DUPLICATE KEY UPDATE
         can_view = VALUES(can_view),
         can_create = VALUES(can_create),
         can_edit = VALUES(can_edit),
         can_delete = VALUES(can_delete),
         updated_at = CURRENT_TIMESTAMP`,
      [moduleItem.key],
    )
  }

  await connection.query(
    `INSERT INTO web_user_roles (user_email, role_code)
     SELECT u.email, 'super_admin'
     FROM app_users u
     LEFT JOIN web_user_roles wur ON wur.user_email = u.email
     WHERE u.role = 'admin'
       AND u.active = 1
       AND wur.user_email IS NULL
     ON DUPLICATE KEY UPDATE user_email = VALUES(user_email)`,
  )
}

function handleApiError(res, error) {
  const status = Number(error?.statusCode || error?.status || 500)
  if (status >= 400 && status < 600) {
    res.status(status).json({ message: toMessage(error) })
    return
  }
  res.status(500).json({ message: toMessage(error) })
}

function normalizeKitIds(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0)
    .filter((item, index, arr) => arr.indexOf(item) === index)
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
}

function normalizeProducts(value) {
  if (!Array.isArray(value)) return []

  return value
    .map((item, index) => {
      const source = item && typeof item === 'object' ? item : {}
      const productCode = String(source.id || source.productCode || source.code || `producto_${index + 1}`).trim()
      const productName = String(source.name || source.productName || source.descripcion || productCode).trim()
      const quantityRaw = Number(source.quantity || source.cantidad || 1)
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1

      if (!productCode || !productName) return null

      return {
        productCode,
        productName,
        quantity,
      }
    })
    .filter(Boolean)
}

function normalizeDeliveryProducts(value) {
  if (!Array.isArray(value)) return []
  const mapped = value
    .map((item) => {
      const source = item && typeof item === 'object' ? item : {}
      const kitCode = String(source.kitCode || source.kitId || source.kit || '').trim()
      const productCode = String(source.productCode || source.id || source.code || '').trim()
      const productName = String(source.productName || source.name || productCode).trim()
      const quantityRaw = Number(source.quantity || source.qty || 0)
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 0
      if (!productCode || quantity <= 0) return null
      return {
        kitCode,
        productCode,
        productName: productName || productCode,
        quantity,
      }
    })
    .filter(Boolean)

  const merged = new Map()
  for (const item of mapped) {
    const key = `${String(item.kitCode || '').trim()}__${String(item.productCode || '').trim()}`
    const current = merged.get(key)
    if (!current) {
      merged.set(key, { ...item })
      continue
    }
    current.quantity = Number(current.quantity || 0) + Number(item.quantity || 0)
  }
  return Array.from(merged.values())
}

function toOptionalString(value) {
  const normalized = String(value || '').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeEmail(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized.length > 0 ? normalized : ''
}

function parseDateBoundary(value, boundary) {
  if (value === null || value === undefined) return null

  let date = null
  if (value instanceof Date) {
    date = new Date(value.getTime())
  } else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    date = new Date(value)
  } else {
    const text = String(value || '').trim()
    if (!text) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [yearRaw, monthRaw, dayRaw] = text.split('-')
      const year = Number(yearRaw)
      const month = Number(monthRaw)
      const day = Number(dayRaw)
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
      date = new Date(year, month - 1, day)
    } else {
      const parsed = new Date(text)
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed
      }
    }
  }

  if (!date || Number.isNaN(date.getTime())) return null
  if (boundary === 'end') {
    date.setHours(23, 59, 59, 999)
  } else {
    date.setHours(0, 0, 0, 0)
  }
  return date
}

function formatDateOnly(value) {
  const parsed = parseDateBoundary(value, 'start')
  if (!parsed) return ''
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toDateBoundaryTimestamp(value, boundary) {
  const parsed = parseDateBoundary(value, boundary)
  return parsed ? Number(parsed.getTime()) : 0
}

function sanitizePathSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'n_a'
}

function resolveEvidenceExtension(originalName, mimeType) {
  const extFromName = String(path.extname(String(originalName || '')) || '').toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(extFromName)) {
    return extFromName === '.jpeg' ? '.jpg' : extFromName
  }

  const mime = String(mimeType || '').toLowerCase()
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  return '.jpg'
}

function buildEvidencePublicUrl(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (EVIDENCE_PUBLIC_BASE) {
    return `${EVIDENCE_PUBLIC_BASE}/${normalized}`
  }
  return `/evidencias/${normalized}`
}

async function storeEvidenceFile({ relativePath, buffer, mimeType }) {
  const normalizedPath = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalizedPath) {
    throw httpError(400, 'Ruta de evidencia invalida')
  }

  if (EVIDENCE_STORAGE_DRIVER === 's3') {
    return storeEvidenceFileOnS3({ relativePath: normalizedPath, buffer, mimeType })
  }

  const storagePath = path.join(EVIDENCE_STORAGE_DIR, ...normalizedPath.split('/'))
  await fsp.mkdir(path.dirname(storagePath), { recursive: true })
  await fsp.writeFile(storagePath, buffer)
  return {
    storagePath,
    publicUrl: buildEvidencePublicUrl(normalizedPath),
  }
}

async function storeEvidenceFileOnS3({ relativePath, buffer, mimeType }) {
  if (!s3Client || !S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
    throw httpError(500, 'S3 no configurado. Revisa S3_BUCKET, S3_ACCESS_KEY y S3_SECRET_KEY')
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: relativePath,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
    }),
  )

  return {
    storagePath: `s3://${S3_BUCKET}/${relativePath}`,
    publicUrl: buildS3PublicUrl(relativePath),
  }
}

function buildS3PublicUrl(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (S3_PUBLIC_BASE_URL) {
    return `${S3_PUBLIC_BASE_URL}/${normalized}`
  }
  if (S3_ENDPOINT) {
    return `${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}/${normalized}`
  }
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${normalized}`
}

function parseKitIdsFromDb(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function parseProductItemsFromDb(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const source = item && typeof item === 'object' ? item : {}
        const kitCode = String(source.kitCode || source.kitId || source.kit_code || '').trim()
        const productCode = String(source.productCode || source.id || source.code || source.product_code || '').trim()
        const productName = String(source.productName || source.name || source.product_name || productCode).trim()
        const quantityRaw = Number(source.quantity || source.qty || 0)
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 0
        if (!productCode || quantity <= 0) return null
        return {
          kitCode,
          productCode,
          productName: productName || productCode,
          quantity,
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function toDeliveryJson(row) {
  return {
    id: String(row.id),
    eventId: String(row.event_id || ''),
    workerDni: String(row.worker_dni || ''),
    sectorId: String(row.sector_id || ''),
    kitIds: parseKitIdsFromDb(row.kit_ids_json),
    products: parseProductItemsFromDb(row.product_items_json),
    timestamp: Number(row.event_timestamp || 0),
    photoPath: String(row.photo_path || ''),
    pdaId: String(row.pda_id || ''),
    userEmail: String(row.user_email || ''),
  }
}

function toEventJson(row) {
  const startDate = formatDateOnly(row.start_at)
  const endDate = formatDateOnly(row.end_at)
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    startDate,
    endDate,
    startAt: toDateBoundaryTimestamp(row.start_at, 'start'),
    endAt: toDateBoundaryTimestamp(row.end_at, 'end'),
    status: String(row.status || ''),
    updatedBy: String(row.updated_by || ''),
    updatedAt: row.updated_at ? Number(new Date(row.updated_at).getTime()) : 0,
  }
}

function toSectorJson(row) {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    active: Number(row.active || 0) === 1,
  }
}

function toGerenciaCatalogJson(row, usage = {}) {
  return {
    name: String(row.name || '').trim(),
    active: Number(row.active || 0) === 1,
    workersCount: Number(usage.workersCount || row.workers_count || 0),
    canDelete: Number(usage.workersCount || row.workers_count || 0) === 0,
  }
}

function toSectorCatalogJson(row, usage = {}) {
  const totalUsage =
    Number(usage.workersCount || row.workers_count || 0) +
    Number(usage.eventsCount || row.events_count || 0) +
    Number(usage.beneficiariesCount || row.beneficiaries_count || 0) +
    Number(usage.deliveriesCount || row.deliveries_count || 0) +
    Number(usage.usersCount || row.users_count || 0) +
    Number(usage.stockRowsCount || row.stock_rows_count || 0)

  return {
    id: String(row.id || '').trim(),
    name: String(row.name || '').trim(),
    active: Number(row.active || 0) === 1,
    workersCount: Number(usage.workersCount || row.workers_count || 0),
    eventsCount: Number(usage.eventsCount || row.events_count || 0),
    beneficiariesCount: Number(usage.beneficiariesCount || row.beneficiaries_count || 0),
    deliveriesCount: Number(usage.deliveriesCount || row.deliveries_count || 0),
    usersCount: Number(usage.usersCount || row.users_count || 0),
    stockRowsCount: Number(usage.stockRowsCount || row.stock_rows_count || 0),
    canDelete: totalUsage === 0,
  }
}

async function getUserByEmail(connection, email) {
  const [rows] = await connection.query(
    `SELECT email, password, full_name, assigned_pda_id, role, active
     FROM app_users
     WHERE email = ?
     LIMIT 1`,
    [email],
  )
  return rows?.[0] || null
}

async function getEventById(connection, eventId) {
  const [rows] = await connection.query(
    `SELECT id, name, start_at, end_at, status, updated_by, updated_at
     FROM events
     WHERE id = ?
     LIMIT 1`,
    [eventId],
  )
  return rows?.[0] || null
}

async function getActiveEvents(connection) {
  const [rows] = await connection.query(
    `SELECT id, name, start_at, end_at, status, updated_by, updated_at
     FROM events
     WHERE status = 'published'
       AND CURDATE() BETWEEN DATE(start_at) AND DATE(end_at)
     ORDER BY start_at DESC, id ASC`,
  )
  return Array.isArray(rows) ? rows : []
}

async function getActiveEvent(connection) {
  const events = await getActiveEvents(connection)
  return events[0] || null
}

async function getActiveEventsForUser(connection, { email, role }) {
  const events = await getActiveEvents(connection)
  if (role === 'admin' || !email) {
    return events
  }

  const [rows] = await connection.query(
    `SELECT DISTINCT event_id
     FROM user_event_sectors
     WHERE user_email = ?`,
    [email],
  )

  const allowed = new Set(rows.map((row) => String(row.event_id || '')))
  return events.filter((event) => allowed.has(String(event.id || '')))
}

function isEventActiveByDate(event) {
  if (!event) return false
  if (String(event.status || '') !== 'published') return false
  const startAt = toDateBoundaryTimestamp(event.start_at, 'start')
  const endAt = toDateBoundaryTimestamp(event.end_at, 'end')
  if (!startAt || !endAt) return false
  const now = Date.now()
  return now >= startAt && now <= endAt
}

async function resolveEvent(connection, { eventId }) {
  const event = eventId
    ? await getEventById(connection, eventId)
    : await getActiveEvent(connection)

  if (!event) {
    throw httpError(404, eventId ? 'Evento no encontrado' : 'No hay evento activo en este momento')
  }

  return event
}

async function getUserSectorsForEvent(connection, { email, role, eventId }) {
  if (role === 'admin') {
    const [rows] = await connection.query(
      `SELECT s.id, s.name
       FROM event_sectors es
       INNER JOIN sectors s ON s.id = es.sector_id
       WHERE es.event_id = ?
       ORDER BY s.name ASC`,
      [eventId],
    )

    return rows.map((row) => ({
      id: String(row.id || ''),
      name: String(row.name || ''),
    }))
  }

  const [rows] = await connection.query(
    `SELECT s.id, s.name
     FROM user_event_sectors ues
     INNER JOIN sectors s ON s.id = ues.sector_id
     WHERE ues.user_email = ?
       AND ues.event_id = ?
     ORDER BY s.name ASC`,
    [email, eventId],
  )

  return rows.map((row) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
  }))
}

async function resolveAllowedSectorIds(connection, { userEmail, eventId }) {
  const normalizedEmail = normalizeEmail(userEmail)
  if (!normalizedEmail) return null

  const user = await getUserByEmail(connection, normalizedEmail)
  if (!user || Number(user.active || 0) !== 1) {
    throw httpError(403, 'Usuario no autorizado para filtrar datos del evento')
  }

  const role = String(user.role || 'pda')
  const sectors = await getUserSectorsForEvent(connection, {
    email: normalizedEmail,
    role,
    eventId,
  })

  if (role === 'admin') return null
  return sectors.map((sector) => sector.id)
}

async function ensureUserCanOperateSector(connection, { userEmail, eventId, sectorId }) {
  const normalizedEmail = normalizeEmail(userEmail)
  if (!normalizedEmail) {
    throw httpError(400, 'userEmail requerido')
  }

  const user = await getUserByEmail(connection, normalizedEmail)
  if (!user || Number(user.active || 0) !== 1) {
    throw httpError(403, 'Usuario no autorizado')
  }

  if (String(user.role || 'pda') === 'admin') return

  const [rows] = await connection.query(
    `SELECT 1
     FROM user_event_sectors
     WHERE user_email = ?
       AND event_id = ?
       AND sector_id = ?
     LIMIT 1`,
    [normalizedEmail, eventId, sectorId],
  )

  if (!rows?.[0]) {
    throw httpError(403, 'Usuario sin permiso para operar el sector del beneficiario')
  }
}

async function resolveSectorForBeneficiary(connection, {
  eventId,
  explicitSectorId,
  area,
  gerencia,
  userEmail,
}) {
  const normalizedSectorId = toOptionalString(explicitSectorId)
  if (normalizedSectorId) {
    await ensureSectorBelongsToEvent(connection, eventId, normalizedSectorId)
    return normalizedSectorId
  }

  const normalizedArea = String(area || '').trim()
  const normalizedGerencia = String(gerencia || '').trim()

  if (normalizedArea || normalizedGerencia) {
    const [rows] = await connection.query(
      `SELECT s.id
       FROM event_sectors es
       INNER JOIN sectors s ON s.id = es.sector_id
       WHERE es.event_id = ?
         AND (
           LOWER(s.name) = LOWER(?)
           OR LOWER(s.name) = LOWER(?)
         )
       LIMIT 1`,
      [eventId, normalizedArea, normalizedGerencia],
    )

    if (rows?.[0]?.id) {
      return String(rows[0].id)
    }
  }

  const userSectorIds = await resolveAllowedSectorIds(connection, { userEmail, eventId })
  if (Array.isArray(userSectorIds) && userSectorIds.length > 0) {
    return userSectorIds[0]
  }

  const [eventSectorRows] = await connection.query(
    `SELECT sector_id
     FROM event_sectors
     WHERE event_id = ?
     ORDER BY sector_id ASC
     LIMIT 1`,
    [eventId],
  )

  if (eventSectorRows?.[0]?.sector_id) {
    return String(eventSectorRows[0].sector_id)
  }

  throw httpError(400, 'No se pudo resolver sector para el beneficiario')
}

async function ensureSectorBelongsToEvent(connection, eventId, sectorId) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM event_sectors
     WHERE event_id = ?
       AND sector_id = ?
     LIMIT 1`,
    [eventId, sectorId],
  )

  if (!rows?.[0]) {
    throw httpError(400, `El sector ${sectorId} no esta habilitado para el evento`)
  }
}

async function ensureSectorEnabledForEvent(connection, eventId, sectorId) {
  const normalizedSectorId = String(sectorId || '').trim()
  if (!normalizedSectorId) throw httpError(400, 'sectorId requerido')

  const [rows] = await connection.query(
    `SELECT id
     FROM sectors
     WHERE id = ?
       AND active = 1
     LIMIT 1`,
    [normalizedSectorId],
  )
  if (!rows?.[0]) {
    throw httpError(400, `El sector ${normalizedSectorId} no existe o esta inactivo en maestros`)
  }

  await connection.query(
    `INSERT IGNORE INTO event_sectors (event_id, sector_id)
     VALUES (?, ?)`,
    [eventId, normalizedSectorId],
  )
}

async function ensureSectorIdsBelongToCatalog(connection, sectorIds) {
  if (!Array.isArray(sectorIds) || sectorIds.length === 0) return

  const [rows] = await connection.query(
    `SELECT id
     FROM sectors
     WHERE id IN (?)`,
    [sectorIds],
  )

  const existing = new Set(rows.map((row) => String(row.id || '')))
  const missing = sectorIds.filter((id) => !existing.has(id))
  if (missing.length > 0) {
    throw httpError(400, `Sectores no encontrados: ${missing.join(', ')}`)
  }
}

async function ensureSectorIdsInEvent(connection, eventId, sectorIds) {
  if (!Array.isArray(sectorIds)) return

  if (sectorIds.length === 0) return

  const [rows] = await connection.query(
    `SELECT sector_id
     FROM event_sectors
     WHERE event_id = ?
       AND sector_id IN (?)`,
    [eventId, sectorIds],
  )

  const existing = new Set(rows.map((row) => String(row.sector_id || '')))
  const missing = sectorIds.filter((id) => !existing.has(id))
  if (missing.length > 0) {
    throw httpError(400, `Sectores no habilitados en evento: ${missing.join(', ')}`)
  }
}

async function fetchKitsByEvent(connection, eventId) {
  const [kitRows] = await connection.query(
    `SELECT code, name, event_id
     FROM event_kits
     WHERE event_id = ?
       AND status = 'active'
     ORDER BY name ASC`,
    [eventId],
  )

  if (!kitRows || kitRows.length === 0) return []

  const kitCodes = kitRows.map((row) => String(row.code || ''))
  const [productRows] = await connection.query(
    `SELECT event_id, kit_code, product_code, product_name, quantity
     FROM event_kit_products
     WHERE event_id = ?
       AND kit_code IN (?)
     ORDER BY kit_code ASC, product_name ASC`,
    [eventId, kitCodes],
  )

  const productMap = new Map()
  for (const row of productRows) {
    const key = String(row.kit_code || '')
    const list = productMap.get(key) || []
    list.push({
      id: String(row.product_code || ''),
      name: String(row.product_name || ''),
      quantity: Number(row.quantity || 1),
    })
    productMap.set(key, list)
  }

  return kitRows.map((row) => {
    const code = String(row.code || '')
    return {
      id: code,
      name: String(row.name || ''),
      eventId: String(row.event_id || eventId),
      products: productMap.get(code) || [],
    }
  })
}

async function fetchKitByCode(connection, eventId, kitCode) {
  const kits = await fetchKitsByEvent(connection, eventId)
  const match = kits.find((kit) => kit.id === kitCode)
  if (!match) {
    throw httpError(404, 'Kit no encontrado')
  }
  return match
}

async function buildDeliveryItems(connection, { eventId, deliveryId, kitIds }) {
  if (!Array.isArray(kitIds) || kitIds.length === 0) {
    throw httpError(400, 'kitIds requeridos para construir detalle de entrega')
  }

  const [rows] = await connection.query(
    `SELECT k.code AS kit_code,
            k.name AS kit_name,
            p.product_code,
            p.product_name,
            p.quantity
     FROM event_kits k
     LEFT JOIN event_kit_products p
       ON p.event_id = k.event_id
      AND p.kit_code = k.code
     WHERE k.event_id = ?
       AND k.code IN (?)`,
    [eventId, kitIds],
  )

  const kitsAvailable = new Set()
  const rowsByKit = new Map()

  for (const row of rows) {
    const kitCode = String(row.kit_code || '')
    if (!kitCode) continue
    kitsAvailable.add(kitCode)

    const list = rowsByKit.get(kitCode) || []
    list.push(row)
    rowsByKit.set(kitCode, list)
  }

  const missingKitIds = kitIds.filter((kitId) => !kitsAvailable.has(kitId))
  if (missingKitIds.length > 0) {
    throw httpError(400, `Kits no configurados para el evento: ${missingKitIds.join(', ')}`)
  }

  const result = []
  for (const kitId of kitIds) {
    const entries = rowsByKit.get(kitId) || []
    const withProduct = entries.filter((entry) => String(entry.product_code || '').trim().length > 0)

    if (withProduct.length === 0) {
      const fallbackName = String(entries?.[0]?.kit_name || kitId)
      result.push({
        deliveryId,
        eventId,
        kitCode: kitId,
        productCode: kitId,
        productName: fallbackName,
        quantity: 1,
      })
      continue
    }

    for (const entry of withProduct) {
      result.push({
        deliveryId,
        eventId,
        kitCode: kitId,
        productCode: String(entry.product_code || ''),
        productName: String(entry.product_name || entry.kit_name || kitId),
        quantity: Number(entry.quantity || 1),
      })
    }
  }

  return result
}

async function buildDeliveryItemsFromProducts(connection, { eventId, deliveryId, products }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw httpError(400, 'products requeridos para construir detalle de entrega')
  }

  const productCodes = products
    .map((item) => String(item.productCode || '').trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)

  const [rows] = await connection.query(
    `SELECT kit_code, product_code, product_name
     FROM event_kit_products
     WHERE event_id = ?
       AND product_code IN (?)`,
    [eventId, productCodes],
  )

  const rowsByProduct = new Map()
  for (const row of rows) {
    const code = String(row.product_code || '').trim()
    if (!code) continue
    const list = rowsByProduct.get(code) || []
    list.push(row)
    rowsByProduct.set(code, list)
  }

  const missing = productCodes.filter((code) => !rowsByProduct.has(code))
  if (missing.length > 0) {
    throw httpError(400, `Productos no configurados para el evento: ${missing.join(', ')}`)
  }

  const mapped = products.map((item) => {
    const productCode = String(item.productCode || '').trim()
    const entries = rowsByProduct.get(productCode) || []
    const requestedKitCode = String(item.kitCode || '').trim()
    const match = requestedKitCode
      ? entries.find((entry) => String(entry.kit_code || '').trim() === requestedKitCode)
      : entries[0]

    if (requestedKitCode && !match) {
      throw httpError(400, `Producto ${productCode} no pertenece al kit ${requestedKitCode} en el evento`)
    }

    const kitCode = String(match?.kit_code || requestedKitCode || '')
    const productName = String(item.productName || match?.product_name || productCode).trim()
    const quantity = Number(item.quantity || 0)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError(400, `Cantidad invalida para producto ${productCode}`)
    }

    return {
      deliveryId,
      eventId,
      kitCode,
      productCode,
      productName: productName || productCode,
      quantity,
    }
  })

  const merged = new Map()
  for (const item of mapped) {
    const key = `${item.kitCode}__${item.productCode}`
    const current = merged.get(key)
    if (!current) {
      merged.set(key, { ...item })
      continue
    }
    current.quantity += Number(item.quantity || 0)
  }
  return Array.from(merged.values())
}

async function ensureProductConfiguredInEvent(connection, eventId, productCode) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM event_kit_products
     WHERE event_id = ?
       AND product_code = ?
     LIMIT 1`,
    [eventId, productCode],
  )
  if (!rows?.[0]) {
    throw httpError(400, `Producto ${productCode} no configurado para el evento`)
  }
}

async function ensureProductSectorStockTable(connection) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS product_sector_stocks (
      event_id VARCHAR(60) NOT NULL,
      product_code VARCHAR(80) NOT NULL,
      sector_id VARCHAR(60) NOT NULL,
      stock_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
      updated_by VARCHAR(200) NOT NULL DEFAULT '',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (event_id, product_code, sector_id),
      KEY idx_product_sector_stocks_sector (event_id, sector_id),
      CONSTRAINT fk_product_sector_stocks_event
        FOREIGN KEY (event_id)
        REFERENCES events (id)
        ON DELETE CASCADE,
      CONSTRAINT fk_product_sector_stocks_sector
        FOREIGN KEY (sector_id)
        REFERENCES sectors (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB`,
  )
}

async function getProductGeneralStockQuantity(connection, { eventId, productCode }) {
  const [rows] = await connection.query(
    `SELECT stock_quantity
     FROM product_stocks
     WHERE event_id = ?
       AND product_code = ?
     LIMIT 1`,
    [eventId, productCode],
  )
  return Math.max(0, Number(rows?.[0]?.stock_quantity || 0))
}

async function getProductSectorStockTotal(connection, { eventId, productCode }) {
  const [rows] = await connection.query(
    `SELECT COALESCE(SUM(stock_quantity), 0) AS total
     FROM product_sector_stocks
     WHERE event_id = ?
       AND product_code = ?`,
    [eventId, productCode],
  )
  return Math.max(0, Number(rows?.[0]?.total || 0))
}

async function getProductSectorStockQuantity(connection, { eventId, productCode, sectorId }) {
  const [rows] = await connection.query(
    `SELECT stock_quantity
     FROM product_sector_stocks
     WHERE event_id = ?
       AND product_code = ?
       AND sector_id = ?
     LIMIT 1`,
    [eventId, productCode, sectorId],
  )
  return Math.max(0, Number(rows?.[0]?.stock_quantity || 0))
}

function normalizeCatalogToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function normalizeCatalogId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

async function ensureGerenciaCatalogTable(connection) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS gerencias (
      name VARCHAR(120) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB`,
  )

  for (const name of FIXED_GERENCIAS) {
    await connection.query(
      `INSERT INTO gerencias (name, active)
       VALUES (?, 1)
       ON DUPLICATE KEY UPDATE
         updated_at = CURRENT_TIMESTAMP`,
      [name],
    )
  }

  await normalizeLegacyGerencias(connection)
}

async function normalizeLegacyGerencias(connection) {
  for (const [legacyToken, canonicalName] of Object.entries(LEGACY_GERENCIA_ALIASES)) {
    const [legacyRows] = await connection.query('SELECT name FROM gerencias ORDER BY name ASC')
    const legacyNames = legacyRows
      .map((row) => String(row.name || '').trim())
      .filter((name) => name && normalizeCatalogToken(name) === legacyToken && name !== canonicalName)

    if (legacyNames.length === 0) continue

    await connection.query(
      `INSERT INTO gerencias (name, active)
       VALUES (?, 1)
       ON DUPLICATE KEY UPDATE
         updated_at = CURRENT_TIMESTAMP`,
      [canonicalName],
    )

    for (const legacyName of legacyNames) {
      await connection.query(
        `UPDATE workers
         SET centro_costo = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE centro_costo = ?`,
        [canonicalName, legacyName],
      )
      await connection.query(
        'DELETE FROM gerencias WHERE name = ?',
        [legacyName],
      )
    }
  }
}

async function fetchGerenciaUsage(connection, name) {
  const [rows] = await connection.query(
    `SELECT COUNT(DISTINCT w.dni) AS workers_count
     FROM workers w
     INNER JOIN event_beneficiaries b
       ON b.worker_dni = w.dni
     WHERE w.centro_costo = ?`,
    [name],
  )
  return { workersCount: Number(rows?.[0]?.workers_count || 0) }
}

async function fetchGerenciasCatalog(connection) {
  const [rows] = await connection.query(
    `SELECT name, active
     FROM gerencias
     ORDER BY active DESC, name ASC`,
  )

  const result = []
  for (const row of rows) {
    const name = String(row.name || '').trim()
    if (!name) continue
    const usage = await fetchGerenciaUsage(connection, name)
    result.push(toGerenciaCatalogJson(row, usage))
  }
  return result
}

async function upsertGerenciaCatalogItem(connection, { currentName, name, active }) {
  const normalizedCurrentName = String(currentName || '').trim()
  const finalName = String(name || '').trim()
  if (!finalName) throw httpError(400, 'Nombre de gerencia requerido')
  if (finalName.length > 120) throw httpError(400, 'Nombre de gerencia demasiado largo')

  if (!normalizedCurrentName || normalizedCurrentName === finalName) {
    await connection.query(
      `INSERT INTO gerencias (name, active)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         active = VALUES(active),
         updated_at = CURRENT_TIMESTAMP`,
      [finalName, active ? 1 : 0],
    )
  } else {
    const [currentRows] = await connection.query('SELECT name FROM gerencias WHERE name = ? LIMIT 1', [normalizedCurrentName])
    if (!currentRows?.[0]) throw httpError(404, 'Gerencia no encontrada')

    await connection.query(
      `INSERT INTO gerencias (name, active)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         active = VALUES(active),
         updated_at = CURRENT_TIMESTAMP`,
      [finalName, active ? 1 : 0],
    )
    await connection.query(
      `UPDATE workers
       SET centro_costo = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE centro_costo = ?`,
      [finalName, normalizedCurrentName],
    )

    const usage = await fetchGerenciaUsage(connection, normalizedCurrentName)
    if (usage.workersCount === 0) {
      await connection.query('DELETE FROM gerencias WHERE name = ?', [normalizedCurrentName])
    } else {
      await connection.query(
        `UPDATE gerencias
         SET active = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE name = ?`,
        [normalizedCurrentName],
      )
    }
  }

  const usage = await fetchGerenciaUsage(connection, finalName)
  return toGerenciaCatalogJson({ name: finalName, active: active ? 1 : 0 }, usage)
}

async function deleteGerenciaCatalogItem(connection, name) {
  const normalizedName = String(name || '').trim()
  if (!normalizedName) throw httpError(400, 'Nombre de gerencia requerido')

  const [rows] = await connection.query('SELECT name, active FROM gerencias WHERE name = ? LIMIT 1', [normalizedName])
  const existing = rows?.[0]
  if (!existing) throw httpError(404, 'Gerencia no encontrada')

  const usage = await fetchGerenciaUsage(connection, normalizedName)
  if (usage.workersCount > 0) {
    await connection.query(
      `UPDATE gerencias
       SET active = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE name = ?`,
      [normalizedName],
    )
    return {
      action: 'deactivate',
      ...toGerenciaCatalogJson({ name: normalizedName, active: 0 }, usage),
      message: 'Gerencia desactivada porque tiene trabajadores relacionados.',
    }
  }

  await connection.query('DELETE FROM gerencias WHERE name = ?', [normalizedName])
  return {
    action: 'delete',
    name: normalizedName,
    active: false,
    workersCount: 0,
    canDelete: true,
    message: 'Gerencia eliminada.',
  }
}

async function fetchSectorUsage(connection, sectorId) {
  await ensureProductSectorStockTable(connection)
  const queries = await Promise.all([
    connection.query('SELECT COUNT(*) AS total FROM workers WHERE sector_id = ?', [sectorId]),
    connection.query('SELECT COUNT(DISTINCT event_id) AS total FROM event_sectors WHERE sector_id = ?', [sectorId]),
    connection.query('SELECT COUNT(*) AS total FROM event_beneficiaries WHERE sector_id = ?', [sectorId]),
    connection.query('SELECT COUNT(*) AS total FROM deliveries WHERE sector_id = ?', [sectorId]),
    connection.query('SELECT COUNT(*) AS total FROM user_event_sectors WHERE sector_id = ?', [sectorId]),
    connection.query('SELECT COUNT(*) AS total FROM product_sector_stocks WHERE sector_id = ?', [sectorId]),
  ])

  const valueAt = (index) => Number(queries[index]?.[0]?.[0]?.total || 0)
  return {
    workersCount: valueAt(0),
    eventsCount: valueAt(1),
    beneficiariesCount: valueAt(2),
    deliveriesCount: valueAt(3),
    usersCount: valueAt(4),
    stockRowsCount: valueAt(5),
  }
}

async function fetchSectorsCatalog(connection) {
  const [rows] = await connection.query(
    `SELECT id, name, active
     FROM sectors
     ORDER BY active DESC, name ASC`,
  )

  const result = []
  for (const row of rows) {
    const id = String(row.id || '').trim()
    if (!id) continue
    const usage = await fetchSectorUsage(connection, id)
    result.push(toSectorCatalogJson(row, usage))
  }
  return result
}

async function upsertSectorCatalogItem(connection, { id, name, active }) {
  const finalName = String(name || '').trim()
  const finalId = normalizeCatalogId(id || finalName)
  if (!finalId) throw httpError(400, 'ID de sector requerido')
  if (!finalName) throw httpError(400, 'Nombre de sector requerido')
  if (finalName.length > 120) throw httpError(400, 'Nombre de sector demasiado largo')

  await connection.query(
    `INSERT INTO sectors (id, name, active)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       active = VALUES(active),
       updated_at = CURRENT_TIMESTAMP`,
    [finalId, finalName, active ? 1 : 0],
  )

  const usage = await fetchSectorUsage(connection, finalId)
  return toSectorCatalogJson({ id: finalId, name: finalName, active: active ? 1 : 0 }, usage)
}

async function deleteSectorCatalogItem(connection, id) {
  const sectorId = String(id || '').trim()
  if (!sectorId) throw httpError(400, 'ID de sector requerido')

  const [rows] = await connection.query('SELECT id, name, active FROM sectors WHERE id = ? LIMIT 1', [sectorId])
  const existing = rows?.[0]
  if (!existing) throw httpError(404, 'Sector no encontrado')

  const usage = await fetchSectorUsage(connection, sectorId)
  const totalUsage =
    usage.workersCount +
    usage.eventsCount +
    usage.beneficiariesCount +
    usage.deliveriesCount +
    usage.usersCount +
    usage.stockRowsCount

  if (totalUsage > 0) {
    await connection.query(
      `UPDATE sectors
       SET active = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [sectorId],
    )
    return {
      action: 'deactivate',
      ...toSectorCatalogJson({ ...existing, active: 0 }, usage),
      message: 'Sector desactivado porque tiene informacion relacionada.',
    }
  }

  await connection.query('DELETE FROM sectors WHERE id = ?', [sectorId])
  return {
    action: 'delete',
    id: sectorId,
    name: String(existing.name || ''),
    active: false,
    canDelete: true,
    message: 'Sector eliminado.',
  }
}

async function resolveCatalogGerenciaName(connection, rawValue) {
  await ensureGerenciaCatalogTable(connection)
  const normalized = normalizeCatalogToken(rawValue)
  if (!normalized) return null

  const [rows] = await connection.query(
    `SELECT name
     FROM gerencias
     WHERE active = 1
     ORDER BY name ASC`,
  )

  for (const row of rows) {
    const name = String(row.name || '').trim()
    if (!name) continue
    if (normalizeCatalogToken(name) === normalized) {
      return name
    }
  }

  return null
}

async function fetchProductStockSummary(connection, eventId) {
  const [productRows] = await connection.query(
    `SELECT product_code, MIN(product_name) AS product_name, SUM(quantity) AS per_beneficiary_quantity
     FROM event_kit_products
     WHERE event_id = ?
     GROUP BY product_code
     ORDER BY product_name ASC`,
    [eventId],
  )

  if (!productRows || productRows.length === 0) return []

  const [beneficiaryRows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM event_beneficiaries
     WHERE event_id = ?
       AND status = 'active'`,
    [eventId],
  )
  const beneficiariesCount = Number(beneficiaryRows?.[0]?.total || 0)

  const productCodes = productRows.map((row) => String(row.product_code || '')).filter(Boolean)
  const [stockRows] = await connection.query(
    `SELECT product_code, stock_quantity
     FROM product_stocks
     WHERE event_id = ?
       AND product_code IN (?)`,
    [eventId, productCodes],
  )
  const stockMap = new Map(
    stockRows.map((row) => [String(row.product_code || ''), Number(row.stock_quantity || 0)]),
  )

  await ensureProductSectorStockTable(connection)
  const [sectorStockRows] = await connection.query(
    `SELECT pss.product_code, pss.sector_id, pss.stock_quantity, s.name AS sector_name
     FROM product_sector_stocks pss
     INNER JOIN sectors s ON s.id = pss.sector_id
     WHERE pss.event_id = ?
       AND pss.product_code IN (?)`,
    [eventId, productCodes],
  )
  const sectorStocksByProduct = new Map()
  for (const row of sectorStockRows) {
    const code = String(row.product_code || '')
    const list = sectorStocksByProduct.get(code) || []
    list.push({
      sectorId: String(row.sector_id || ''),
      sectorName: String(row.sector_name || row.sector_id || ''),
      stockQuantity: Math.max(0, Number(row.stock_quantity || 0)),
    })
    sectorStocksByProduct.set(code, list)
  }

  const [deliveredRows] = await connection.query(
    `SELECT di.product_code, SUM(di.quantity) AS delivered_quantity
     FROM delivery_items di
     INNER JOIN deliveries d ON d.id = di.delivery_id
     WHERE d.event_id = ?
       AND di.product_code IN (?)
       AND di.delivered = 1
     GROUP BY di.product_code`,
    [eventId, productCodes],
  )
  const deliveredMap = new Map(
    deliveredRows.map((row) => [String(row.product_code || ''), Number(row.delivered_quantity || 0)]),
  )

  return productRows.map((row) => {
    const productCode = String(row.product_code || '')
    const perBeneficiaryQuantity = Number(row.per_beneficiary_quantity || 0)
    const requiredQuantity = Math.max(0, beneficiariesCount * perBeneficiaryQuantity)
    const stockQuantity = Math.max(0, stockMap.get(productCode) || 0)
    const deliveredQuantity = Math.max(0, deliveredMap.get(productCode) || 0)
    const availableQuantity = Math.max(0, stockQuantity - deliveredQuantity)
    const sectorStocks = (sectorStocksByProduct.get(productCode) || []).sort((a, b) =>
      String(a.sectorName || '').localeCompare(String(b.sectorName || ''), 'es'),
    )
    const sectorStockQuantity = sectorStocks.reduce((acc, item) => acc + Number(item.stockQuantity || 0), 0)

    return {
      eventId,
      productCode,
      productName: String(row.product_name || productCode),
      perBeneficiaryQuantity,
      beneficiariesCount,
      requiredQuantity,
      stockQuantity,
      sectorStockQuantity,
      sectorStocks,
      deliveredQuantity,
      availableQuantity,
      sufficientForBeneficiaries: stockQuantity >= requiredQuantity,
    }
  })
}

async function fetchSectorStockSummary(connection, { eventId, sectorId }) {
  await ensureProductSectorStockTable(connection)

  const [sectorStockRows] = await connection.query(
    `SELECT pss.product_code,
            pss.stock_quantity,
            MIN(ekp.product_name) AS product_name
     FROM product_sector_stocks pss
     LEFT JOIN event_kit_products ekp
       ON ekp.event_id = pss.event_id
      AND ekp.product_code = pss.product_code
     WHERE pss.event_id = ?
       AND pss.sector_id = ?
     GROUP BY pss.product_code, pss.stock_quantity
     ORDER BY product_name ASC, pss.product_code ASC`,
    [eventId, sectorId],
  )

  const productCodes = (sectorStockRows || [])
    .map((row) => String(row.product_code || '').trim())
    .filter(Boolean)

  if (productCodes.length === 0) {
    return {
      eventId,
      sectorId,
      totals: {
        assignedStock: 0,
        consumedQuantity: 0,
        balanceQuantity: 0,
      },
      items: [],
    }
  }

  const [consumedRows] = await connection.query(
    `SELECT di.product_code, SUM(di.quantity) AS consumed_quantity
     FROM delivery_items di
     INNER JOIN deliveries d ON d.id = di.delivery_id
     WHERE d.event_id = ?
       AND d.sector_id = ?
       AND di.delivered = 1
       AND di.product_code IN (?)
     GROUP BY di.product_code`,
    [eventId, sectorId, productCodes],
  )
  const consumedMap = new Map(
    consumedRows.map((row) => [String(row.product_code || '').trim(), Number(row.consumed_quantity || 0)]),
  )

  const items = sectorStockRows.map((row) => {
    const productCode = String(row.product_code || '').trim()
    const assignedStock = Math.max(0, Number(row.stock_quantity || 0))
    const consumedQuantity = Math.max(0, Number(consumedMap.get(productCode) || 0))
    const balanceQuantity = assignedStock - consumedQuantity
    return {
      productCode,
      productName: String(row.product_name || productCode).trim() || productCode,
      assignedStock,
      consumedQuantity,
      balanceQuantity,
    }
  })

  return {
    eventId,
    sectorId,
    totals: {
      assignedStock: items.reduce((acc, item) => acc + Number(item.assignedStock || 0), 0),
      consumedQuantity: items.reduce((acc, item) => acc + Number(item.consumedQuantity || 0), 0),
      balanceQuantity: items.reduce((acc, item) => acc + Number(item.balanceQuantity || 0), 0),
    },
    items,
  }
}

async function ensureDeliveryStockAvailability(connection, { eventId, deliveryId, sectorId, items }) {
  if (!Array.isArray(items) || items.length === 0) return

  const requestedMap = new Map()
  for (const item of items) {
    const productCode = String(item.productCode || '').trim()
    const quantity = Number(item.quantity || 0)
    if (!productCode || !Number.isFinite(quantity) || quantity <= 0) continue
    requestedMap.set(productCode, (requestedMap.get(productCode) || 0) + quantity)
  }

  const productCodes = Array.from(requestedMap.keys())
  if (productCodes.length === 0) return

  const [stockRows] = await connection.query(
    `SELECT product_code, stock_quantity
     FROM product_stocks
     WHERE event_id = ?
       AND product_code IN (?)`,
    [eventId, productCodes],
  )
  const stockMap = new Map(
    stockRows.map((row) => [String(row.product_code || ''), Number(row.stock_quantity || 0)]),
  )

  const [consumedRows] = await connection.query(
    `SELECT di.product_code, SUM(di.quantity) AS consumed_quantity
     FROM delivery_items di
     INNER JOIN deliveries d ON d.id = di.delivery_id
     WHERE d.event_id = ?
       AND di.product_code IN (?)
       AND di.delivered = 1
       AND d.id <> ?
     GROUP BY di.product_code`,
    [eventId, productCodes, deliveryId],
  )
  const consumedMap = new Map(
    consumedRows.map((row) => [String(row.product_code || ''), Number(row.consumed_quantity || 0)]),
  )

  const shortages = []
  for (const productCode of productCodes) {
    const requested = Number(requestedMap.get(productCode) || 0)
    const stock = Number(stockMap.get(productCode) || 0)
    const consumed = Number(consumedMap.get(productCode) || 0)
    const available = stock - consumed
    if (requested > available + 0.000001) {
      shortages.push({
        productCode,
        requested,
        available: Math.max(0, available),
      })
    }
  }

  if (shortages.length > 0) {
    const detail = shortages
      .map((item) => `${item.productCode} (solicitado: ${item.requested}, disponible: ${item.available})`)
      .join('; ')
    throw httpError(400, `Stock insuficiente para registrar la entrega: ${detail}`)
  }

  if (!sectorId) return

  await ensureProductSectorStockTable(connection)
  const [sectorStockRows] = await connection.query(
    `SELECT product_code, stock_quantity
     FROM product_sector_stocks
     WHERE event_id = ?
       AND sector_id = ?
       AND product_code IN (?)`,
    [eventId, sectorId, productCodes],
  )
  if (!sectorStockRows || sectorStockRows.length === 0) return

  const sectorStockMap = new Map(
    sectorStockRows.map((row) => [String(row.product_code || ''), Number(row.stock_quantity || 0)]),
  )

  const [sectorConsumedRows] = await connection.query(
    `SELECT di.product_code, SUM(di.quantity) AS consumed_quantity
     FROM delivery_items di
     INNER JOIN deliveries d ON d.id = di.delivery_id
     WHERE d.event_id = ?
       AND d.sector_id = ?
       AND di.product_code IN (?)
       AND di.delivered = 1
       AND d.id <> ?
     GROUP BY di.product_code`,
    [eventId, sectorId, productCodes, deliveryId],
  )
  const sectorConsumedMap = new Map(
    sectorConsumedRows.map((row) => [String(row.product_code || ''), Number(row.consumed_quantity || 0)]),
  )

  const sectorShortages = []
  for (const productCode of productCodes) {
    if (!sectorStockMap.has(productCode)) continue
    const requested = Number(requestedMap.get(productCode) || 0)
    const stock = Number(sectorStockMap.get(productCode) || 0)
    const consumed = Number(sectorConsumedMap.get(productCode) || 0)
    const available = stock - consumed
    if (requested > available + 0.000001) {
      sectorShortages.push({
        productCode,
        requested,
        available: Math.max(0, available),
      })
    }
  }

  if (sectorShortages.length > 0) {
    const detail = sectorShortages
      .map((item) => `${item.productCode} (solicitado: ${item.requested}, disponible sector: ${item.available})`)
      .join('; ')
    throw httpError(400, `Stock por sector insuficiente para registrar la entrega: ${detail}`)
  }
}

async function fetchDeliveryById(connection, deliveryId) {
  const [rows] = await connection.query(
    `SELECT id, event_id, worker_dni, sector_id, kit_ids_json, product_items_json, event_timestamp, photo_path, pda_id, user_email
     FROM deliveries
     WHERE id = ?
     LIMIT 1`,
    [deliveryId],
  )

  const row = rows?.[0]
  if (!row) {
    throw httpError(404, 'Entrega no encontrada')
  }

  return toDeliveryJson(row)
}

function loadDotEnvLikeFile() {
  const cwd = process.cwd()
  const currentFile = fileURLToPath(import.meta.url)
  const candidates = [
    path.resolve(cwd, '.env'),
    path.resolve(cwd, 'backend', '.env'),
    path.resolve(path.dirname(currentFile), '..', '.env'),
  ]

  const filePath = candidates.find((candidate) => fs.existsSync(candidate))
  if (!filePath) return

  const content = fs.readFileSync(filePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx <= 0) return
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (!(key in process.env)) {
      process.env[key] = value
    }
  })
}
