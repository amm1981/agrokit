import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { Loader } from '../components/Loader'
import { useAuth } from '../hooks/useAuth'
import { RealtimeDataProvider } from '../hooks/useRealtimeData'
import { BeneficiariosPage } from '../pages/Beneficiarios'
import { DashboardPage } from '../pages/Dashboard'
import { EntregasPage } from '../pages/Entregas'
import { EventosPage } from '../pages/Eventos'
import { KitsPage } from '../pages/Kits'
import { LoginPage } from '../pages/Login'
import { MaestrosPage } from '../pages/Maestros'
import { RolesWebPage } from '../pages/RolesWeb'
import { TrabajadoresPage } from '../pages/Trabajadores'
import { UsuariosPage } from '../pages/Usuarios'
import { UsuariosWebPage } from '../pages/UsuariosWeb'
import { ProtectedRoute } from './ProtectedRoute'

function HomeRedirect() {
  const { user, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <Loader label="Validando sesion..." />
      </div>
    )
  }

  return <Navigate to={user && isAdmin ? '/dashboard' : '/login'} replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <RealtimeDataProvider>
              <AppLayout />
            </RealtimeDataProvider>
          }
        >
          <Route element={<ProtectedRoute moduleKey="dashboard" />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute moduleKey="eventos" />}>
            <Route path="/eventos" element={<EventosPage />} />
          </Route>
          <Route element={<ProtectedRoute moduleKey="beneficiarios" />}>
            <Route path="/beneficiarios" element={<BeneficiariosPage />} />
          </Route>
          <Route element={<ProtectedRoute moduleKey="entregas" />}>
            <Route path="/entregas" element={<EntregasPage />} />
          </Route>
          <Route element={<ProtectedRoute moduleKey="trabajadores" />}>
            <Route path="/trabajadores" element={<TrabajadoresPage />} />
          </Route>
          <Route element={<ProtectedRoute moduleKey="kits" />}>
            <Route path="/kits" element={<KitsPage />} />
          </Route>
          <Route element={<ProtectedRoute moduleKey="maestros" />}>
            <Route path="/maestros" element={<MaestrosPage />} />
          </Route>
          <Route element={<ProtectedRoute moduleKey="usuarios_pda" />}>
            <Route path="/usuarios-pda/usuarios" element={<UsuariosPage />} />
            <Route path="/usuarios-pda" element={<Navigate to="/usuarios-pda/usuarios" replace />} />
            <Route path="/usuarios" element={<Navigate to="/usuarios-pda/usuarios" replace />} />
          </Route>
          <Route element={<ProtectedRoute moduleKey="usuarios_web" />}>
            <Route path="/usuarios-web/roles" element={<RolesWebPage />} />
            <Route path="/usuarios-web/usuarios" element={<UsuariosWebPage />} />
            <Route path="/usuarios-web" element={<Navigate to="/usuarios-web/roles" replace />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
