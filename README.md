# agrokit

Monorepo del sistema AgroKit.

## Estructura

- `AgroKit/`: aplicacion Android y backend local.
- `AgroKit/backend/`: API REST, WebSocket y almacenamiento de evidencias.
- `web/`: panel web administrativo.

## Arranque local

Backend:

```bash
cd AgroKit/backend
npm install
npm run dev
```

Web:

```bash
cd web
npm install
npm run dev
```

Android:

Abrir la carpeta `AgroKit/` desde Android Studio.
