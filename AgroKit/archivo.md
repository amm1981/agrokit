# Archivo de contexto del proyecto AgroKit

Ultima actualizacion: 2026-04-29

Resumen operativo y tecnico para mantener contexto rapido en cada nueva instruccion.

## 1) Estructura del proyecto

- Aplicativo Android + backend:
  - `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\AgroKit`
- Web administrador:
  - `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\web`
- Backend API:
  - `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\AgroKit\backend`

## 2) Alcance funcional

- Web administrador:
  - Configura y gestiona maestros (eventos, sectores, trabajadores, kits, stock, usuarios PDA).
  - Consulta ejecutiva de indicadores.
- App PDA:
  - Solo validacion y entrega.
  - No administra maestros (no crea/edita kits, trabajadores ni dashboard de configuracion).

## 3) Stack tecnologico

### 3.1 Web

- React 19 + TypeScript + Vite
- TailwindCSS
- React Router
- XLSX para plantilla/carga masiva/export

### 3.2 Backend

- Node.js (ESM) + Express
- MySQL (`mysql2/promise`)
- WebSocket (`ws`)
- `multer` para evidencias
- AWS SDK v3 (`@aws-sdk/client-s3`) para Object Storage compatible S3

### 3.3 App PDA

- Kotlin + Jetpack Compose (Material3)
- Hilt + Coroutines/Flow
- Room (offline)
- OkHttp (REST + WS)
- WorkManager (sincronizacion)

### 3.4 Base de datos

- MySQL local (desarrollo)
- Script principal:
  - `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\AgroKit\backend\sql\schema.sql`

## 4) Reglas de negocio vigentes

- Entrega por producto (no por kit como bloque unico).
- No se digita cantidad en app para entregar:
  - se selecciona el producto
  - el descuento se hace automaticamente segun cantidad pendiente/requerida del producto.
- Stock administrado en modulo Kits (web), no en dashboard.
- Stock por sector:
  - suma de sectores <= stock general.
  - guardado conjunto (batch), no sector por sector.
- Dashboard:
  - solo consulta/filtros, sin registrar datos.
- Trabajadores:
  - columnas maestras: Nombre, DNI, Area, Gerencia, Sector.
  - "Centro de costo" reemplazado por "Gerencia".
  - solo permite gerencia y sector existentes en catalogo/evento.
- Usuarios PDA:
  - se les asigna sectores.
  - app solo muestra/permite operacion en sectores asignados.
- Si trabajador pertenece a otro sector:
  - se informa el nombre del sector (no id)
  - se muestra detalle de entrega cuando exista.
- Si trabajador no existe en maestro:
  - se informa "no encontrado".
- Si trabajador ya tiene entregas:
  - bloqueo de edicion/eliminacion en maestro web.
  - correcciones se hacen editando/ajustando entregas.

## 5) Backend (estado actual)

Archivo principal:
- `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\AgroKit\backend\src\server.js`

Capacidades activas:
- Auth login.
- Catalogos de sectores/gerencias.
- Trabajadores lookup por DNI con estados:
  - `AVAILABLE`
  - `OTHER_SECTOR`
  - `NOT_FOUND`
- Kits y productos por evento.
- Stock general y stock sectorial por producto (incluye guardado conjunto).
- Entregas con evidencias y descuento de stock.
- Evidencias configurables:
  - local por filesystem (`EVIDENCE_STORAGE_DRIVER=local`)
  - Contabo Object Storage S3 compatible (`EVIDENCE_STORAGE_DRIVER=s3`)
- WebSocket para refresco casi en tiempo real.

Gerencias de catalogo fijo:
- Gerencia Administrativa
- Gerencia General
- Gerencia Citricos
- Gerencia Paltos

## 6) Base de datos (modelo funcional)

Tablas principales:
- Catalogos: `sectors`, `gerencias`
- Eventos: `events`, `event_sectors`
- Maestros: `workers`, `event_beneficiaries`
- Kits: `event_kits`, `event_kit_products`
- Stock: `product_stocks`, `product_sector_stocks`
- Entregas: `deliveries`, `delivery_items`, `delivery_evidences`
- Usuarios: `app_users`, `user_event_sectors`

## 7) Web administrador (estado actual)

### 7.1 UI/UX aplicado

- Sidebar con fondo blanco.
- Sin tarjeta/borde alrededor de logo/correo en sidebar.
- Header simplificado:
  - se retiro el texto "Administracion centralizada / Maestros..."
  - estado online con icono de senal
  - icono de estado sin borde.
- Selector de evento:
  - muestra solo nombre del evento (no id/codigo).

### 7.2 Login web

- Se usan ambos logos desde `web/public`:
  - `AGROCALERA_Negativo.png` (empresa)
  - `logo_AgroKit.png` (sistema)
- Maquetado en una misma fila (empresa izquierda, sistema derecha).
- Texto principal: `Login` centrado, tono gris oscuro.
- Se retiro texto informativo innecesario.

### 7.3 Modulo Trabajadores

- Carga masiva con plantilla descargable.
- Plantilla actual:
  - Nombre
  - DNI
  - Area
  - Gerencia
  - Sector

### 7.4 Modulo Kits

- Registro de kits en modal.
- Boton "Crear kit".
- Luego de crear kit, asignacion de productos.
- Producto:
  - id generado usando abreviatura del evento.
  - nombre y cantidad requerida manual.
- Stock:
  - stock general.
  - stock por sector en una sola operacion conjunta.
  - validacion suma sectores <= stock general.

### 7.5 Modulo Entregas (web)

- Filtros:
  - buscar
  - producto
  - usuario
  - sede
  - gerencia
  - rango fecha: hoy / ultimos 7 dias / personalizado.
- Indicadores:
  - stock general
  - stock por sede
  - % entregas por sector
  - % entregas general
  - % entregas por gerencia
- Estilo visual actual:
  - indicadores visuales verdes por bloque (barra lateral y barra superior en seccion de resultados).

## 8) App PDA Android (estado actual)

### 8.1 Header y navegacion

- Header con solo icono/logo (sin texto adicional).
- Modulo resumen stock/consumo accesible por FAB central.
- El resumen abre como pantalla interna (no modal).
- Boton volver y soporte de boton atras Android.
- Conexion actual del app:
  - REST: `https://agrocalera.app` (rutas con prefijo `/api`)
  - WebSocket: `wss://agrocalera.app/ws`
  - Las rutas del app incluyen el prefijo `/api`.

### 8.2 Login app

- Campo de contrasena oculto por defecto.
- Toggle mostrar/ocultar (icono ojo).

### 8.3 Flujo de entrega

- Validacion por DNI.
- Si es de otro sector:
  - alerta con nombre de sector.
  - incluye detalle de entrega cuando ya exista.
- En trabajador valido:
  - listado de productos pendientes/entregados.
  - cuando ya hubo entrega, se muestra fecha, hora, sector y quien entrego.
- Registro de evidencia foto al entregar.

### 8.4 Resumen stock/consumo por sector

- Muestra por sector:
  - stock asignado
  - consumo
  - saldo
- Si usuario tiene 1 sector:
  - seleccion automatica.
- Si tiene varios:
  - selector de sector y recarga de datos al cambiar.

## 9) Ejecucion local

### 9.1 Backend

Ruta:
- `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\AgroKit\backend`

Pasos:
1. Configurar `.env`.
2. Ejecutar `sql/schema.sql`.
3. `npm install`
4. `npm run dev`

### 9.2 Web

Ruta:
- `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\web`

Pasos:
1. Configurar `.env` (`VITE_BACKEND_BASE_URL`, `VITE_BACKEND_WS_URL`).
2. `npm install`
3. `npm run dev`

### 9.3 App Android

Ruta:
- `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\AgroKit`

Comando de validacion rapida:
- `.\gradlew.bat :app:compileDebugKotlin`

## 10) Nota de uso

Antes de cada cambio nuevo:
1. Revisar este archivo.
2. Definir impacto en web/backend/app/BD.
3. Mantener consistencia con reglas de sector, stock y entregas.

Guia de despliegue produccion:
- `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\AgroKit\DEPLOY_PRODUCCION.md`

Ubicacion:
- `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\AgroKit\archivo.md`
