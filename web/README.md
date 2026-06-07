# AgroKit Web Admin

Panel administrativo React + Vite para operar el modelo multi-evento de AgroKit:
- eventos
- sectores por evento
- beneficiarios
- kits y productos
- usuarios PDA por sector
- dashboard y entregas por evento

## Configuracion

Variables en `.env`:

```env
VITE_BACKEND_BASE_URL=https://agrokit.agrocalera.app
VITE_BACKEND_WS_URL=wss://agrokit.agrocalera.app/ws
VITE_ADMIN_EMAIL=admin@gmail.com
```

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```
