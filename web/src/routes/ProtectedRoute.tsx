import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Loader } from '../components/Loader'

interface ProtectedRouteProps {
  moduleKey?: string
}

export function ProtectedRoute({ moduleKey }: ProtectedRouteProps = {}) {
  const { user, loading, isAdmin, hasPermission } = useAuth()
  const location = useLocation()

  if (loading) {
    return <Loader label="Validando sesion..." />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!isAdmin) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (moduleKey && !hasPermission(moduleKey, 'view')) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
