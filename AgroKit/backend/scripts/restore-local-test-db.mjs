import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '..')

loadEnvFile(path.resolve(backendRoot, '.env'))

const dumpArg = process.argv[2]
const databaseArg = process.argv[3]
const shouldDrop = process.argv.includes('--drop')
const allowRemote = process.argv.includes('--allow-remote')

if (!dumpArg || !databaseArg) {
  console.error('Uso: node scripts/restore-local-test-db.mjs <dump.sql> <base_local_prueba> --drop')
  process.exit(1)
}

if (!shouldDrop) {
  console.error('Falta --drop. Este script recrea una base local de prueba para evitar mezclas de datos.')
  process.exit(1)
}

const mysqlHost = process.env.MYSQL_HOST || '127.0.0.1'
const mysqlPort = Number(process.env.MYSQL_PORT || 3306)
const mysqlUser = process.env.MYSQL_USER || 'root'
const mysqlPassword = process.env.MYSQL_PASSWORD || ''
const targetDb = normalizeDatabaseName(databaseArg)

if (!targetDb) {
  console.error(`Nombre de base invalido: ${databaseArg}`)
  process.exit(1)
}

if (!allowRemote && !['127.0.0.1', 'localhost', '::1'].includes(mysqlHost)) {
  console.error(`Bloqueado: MYSQL_HOST=${mysqlHost}. Usa --allow-remote solo si estas seguro.`)
  process.exit(1)
}

const configuredDb = normalizeDatabaseName(process.env.MYSQL_DB || '')
if (targetDb === configuredDb) {
  console.error(`Bloqueado: no recrees la base configurada MYSQL_DB=${configuredDb}. Usa una base temporal, por ejemplo agrokit_prd_test.`)
  process.exit(1)
}

const dumpPath = path.resolve(backendRoot, dumpArg)
if (!fs.existsSync(dumpPath)) {
  console.error(`No existe el dump: ${dumpPath}`)
  process.exit(1)
}

const dumpSql = fs.readFileSync(dumpPath, 'utf8').trim()
if (!dumpSql) {
  console.error(`Dump vacio: ${dumpPath}`)
  process.exit(1)
}

const adminConnection = await mysql.createConnection({
  host: mysqlHost,
  port: mysqlPort,
  user: mysqlUser,
  password: mysqlPassword,
  multipleStatements: true,
})

try {
  console.log(`Recreando base local ${targetDb} en ${mysqlUser}@${mysqlHost}:${mysqlPort}`)
  await adminConnection.query(`DROP DATABASE IF EXISTS \`${targetDb}\``)
  await adminConnection.query(`CREATE DATABASE \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
} finally {
  await adminConnection.end()
}

const restoreConnection = await mysql.createConnection({
  host: mysqlHost,
  port: mysqlPort,
  user: mysqlUser,
  password: mysqlPassword,
  database: targetDb,
  multipleStatements: true,
})

try {
  console.log(`Importando ${path.relative(backendRoot, dumpPath)} en ${targetDb}`)
  await restoreConnection.query(dumpSql)
  console.log('Respaldo importado correctamente.')
} finally {
  await restoreConnection.end()
}

function normalizeDatabaseName(value) {
  const raw = String(value || '').trim()
  return /^[A-Za-z0-9_]+$/.test(raw) ? raw : ''
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
