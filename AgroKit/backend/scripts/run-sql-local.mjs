import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '..')

loadEnvFile(path.resolve(backendRoot, '.env'))

const sqlArg = process.argv[2]
const allowRemote = process.argv.includes('--allow-remote')
const databaseFlagIndex = process.argv.indexOf('--database')
const databaseOverride = databaseFlagIndex >= 0 ? process.argv[databaseFlagIndex + 1] : ''

if (!sqlArg) {
  console.error('Uso: node scripts/run-sql-local.mjs <archivo.sql> [--allow-remote]')
  process.exit(1)
}

const mysqlHost = process.env.MYSQL_HOST || '127.0.0.1'
const mysqlPort = Number(process.env.MYSQL_PORT || 3306)
if (databaseFlagIndex >= 0 && !normalizeDatabaseName(databaseOverride)) {
  console.error(`Nombre de base invalido: ${databaseOverride || '(vacio)'}`)
  process.exit(1)
}
const mysqlDb = normalizeDatabaseName(databaseOverride) || process.env.MYSQL_DB || 'agrokit'
const mysqlUser = process.env.MYSQL_USER || 'root'
const mysqlPassword = process.env.MYSQL_PASSWORD || ''

if (!allowRemote && !['127.0.0.1', 'localhost', '::1'].includes(mysqlHost)) {
  console.error(`Bloqueado: MYSQL_HOST=${mysqlHost}. Usa --allow-remote solo si estas seguro.`)
  process.exit(1)
}

const sqlPath = path.resolve(backendRoot, sqlArg)
if (!fs.existsSync(sqlPath)) {
  console.error(`No existe el archivo SQL: ${sqlPath}`)
  process.exit(1)
}

const sql = fs.readFileSync(sqlPath, 'utf8').trim()
if (!sql) {
  console.error(`Archivo SQL vacio: ${sqlPath}`)
  process.exit(1)
}

const connection = await mysql.createConnection({
  host: mysqlHost,
  port: mysqlPort,
  user: mysqlUser,
  password: mysqlPassword,
  database: mysqlDb,
  multipleStatements: true,
})

try {
  console.log(`Ejecutando ${path.relative(backendRoot, sqlPath)} en ${mysqlUser}@${mysqlHost}:${mysqlPort}/${mysqlDb}`)
  await connection.query(sql)
  console.log('SQL ejecutado correctamente.')
} finally {
  await connection.end()
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return

  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function normalizeDatabaseName(value) {
  const raw = String(value || '').trim()
  return /^[A-Za-z0-9_]+$/.test(raw) ? raw : ''
}
