# AgroKit Backend Local (MySQL + WebSocket + Evidencias en servidor)

## Requisitos
- Node.js 18+
- MySQL (WampServer/XAMPP/local)

## 1) Crear esquema
Ejecuta:

- `backend/sql/schema.sql`

Este esquema ya crea:
- eventos (`events`)
- sectores (`sectors`, `event_sectors`)
- beneficiarios por evento (`event_beneficiaries`)
- kits por evento y productos (`event_kits`, `event_kit_products`)
- trazabilidad de entrega (`deliveries`, `delivery_items`)
- evidencias en servidor (`delivery_evidences`)
- usuarios y asignaciones por sector (`app_users`, `user_event_sectors`)

## 2) Configurar variables
Copia:

- `.env.example` -> `.env`

Variables importantes:
- `PORT`
- `MYSQL_*`
- `EVIDENCE_STORAGE_DIR`
- `EVIDENCE_PUBLIC_BASE` (opcional)

## 3) Instalar y correr
```bash
cd backend
npm install
npm run dev
```

## API principal
- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/events`
- `GET /api/events/active`
- `PUT /api/events/:id`
- `GET /api/sectors`
- `GET|PUT|DELETE /api/workers`
- `GET|PUT|DELETE /api/kits`
- `GET|PUT|DELETE /api/deliveries`
- `POST /api/deliveries/:id/evidences` (multipart campo `file`)
- `GET /api/evidences/:id`
- `GET|PUT /api/settings/delivery-window`
- `GET|PUT /api/users`

## Evidencia
- Los archivos se guardan en disco del backend (`EVIDENCE_STORAGE_DIR`).
- Se exponen por `GET /evidencias/...`.
- Al subir evidencia se actualiza `deliveries.photo_path` con la URL pÃºblica.

## WebSocket
- URL: `ws://<IP_PC>:8081/ws`
- Entidades emitidas: `events`, `workers`, `kits`, `deliveries`, `settings.deliveryWindow`, `users`

