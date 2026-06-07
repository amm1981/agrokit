import { useEffect, useState, type ReactElement, type SVGProps } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRealtimeData } from '../hooks/useRealtimeData'

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement

const SIDEBAR_KEY = 'agrokit_web_sidebar_collapsed'

function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="4" rx="1" />
      <rect x="14" y="10" width="7" height="11" rx="1" />
      <rect x="3" y="13" width="7" height="8" rx="1" />
    </svg>
  )
}

function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  )
}

function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M23 11h-6" />
    </svg>
  )
}

function BoxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  )
}

function ClipboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  )
}

function KitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 3v3" />
      <path d="M16 3v3" />
      <rect x="4" y="6" width="16" height="15" rx="2" />
      <path d="M4 11h16" />
    </svg>
  )
}

function CatalogIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  )
}

function UserBadgeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="7" r="4" />
      <path d="M5 21v-1a7 7 0 0 1 14 0v1" />
      <path d="M18 3h3v3" />
      <path d="M21 3l-2.5 2.5" />
    </svg>
  )
}

function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3l7 4v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V7l7-4z" />
      <path d="M9.5 12.5 11 14l3.5-4" />
    </svg>
  )
}

function SignalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 8.8a16 16 0 0 1 20 0" />
      <path d="M5.5 12.5a10.5 10.5 0 0 1 13 0" />
      <path d="M9 16a5 5 0 0 1 6 0" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </svg>
  )
}

function PanelToggleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  )
}

function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

function getEmailInitials(email?: string) {
  if (!email) return 'US'
  const [localPart = '', domainPart = ''] = email.split('@')
  const first = localPart.trim().charAt(0)
  const second = domainPart.trim().charAt(0)
  return `${first}${second || localPart.trim().charAt(1) || ''}`.toUpperCase()
}

interface NavItem {
  to: string
  label: string
  icon: IconComponent
  moduleKey: string
}

interface NavGroup {
  label: string
  moduleKey: string
  items: NavItem[]
}

const mainNavItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon, moduleKey: 'dashboard' },
  { to: '/eventos', label: 'Eventos', icon: CalendarIcon, moduleKey: 'eventos' },
  { to: '/beneficiarios', label: 'Beneficiarios', icon: UsersIcon, moduleKey: 'beneficiarios' },
  { to: '/entregas', label: 'Entregas', icon: BoxIcon, moduleKey: 'entregas' },
  { to: '/trabajadores', label: 'Trabajadores', icon: ClipboardIcon, moduleKey: 'trabajadores' },
  { to: '/kits', label: 'Kits', icon: KitIcon, moduleKey: 'kits' },
  { to: '/maestros', label: 'Maestros', icon: CatalogIcon, moduleKey: 'maestros' },
]

const groupedNavItems: NavGroup[] = [
  {
    label: 'Usuarios PDA',
    moduleKey: 'usuarios_pda',
    items: [{ to: '/usuarios-pda/usuarios', label: 'Usuarios', icon: UserBadgeIcon, moduleKey: 'usuarios_pda' }],
  },
  {
    label: 'Usuarios Web',
    moduleKey: 'usuarios_web',
    items: [
      { to: '/usuarios-web/roles', label: 'Roles', icon: ShieldIcon, moduleKey: 'usuarios_web' },
      { to: '/usuarios-web/usuarios', label: 'Usuarios', icon: UserBadgeIcon, moduleKey: 'usuarios_web' },
    ],
  },
]

function SidebarLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate: () => void
}) {
  const Icon = item.icon
  return (
    <NavLink
      key={item.to}
      to={item.to}
      title={item.label}
      onClick={onNavigate}
      className={({ isActive }) =>
        `relative flex items-center rounded-2xl font-medium transition ${
          collapsed ? 'h-12 justify-center px-0' : 'gap-4 px-5 py-4 text-[17px]'
        } ${
          isActive
            ? 'bg-emerald-100/80 text-slate-950 shadow-sm before:absolute before:-left-3 before:top-1/2 before:h-10 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-emerald-600'
            : 'text-slate-700 hover:bg-white/70 hover:text-slate-950'
        }`
      }
    >
      <Icon className={`${collapsed ? 'h-5 w-5' : 'h-6 w-6'} shrink-0`} />
      {!collapsed ? <span>{item.label}</span> : null}
    </NavLink>
  )
}

export function AppLayout() {
  const { user, logout, hasPermission } = useAuth()
  const { events, selectedEventId, setSelectedEventId } = useRealtimeData()
  const [isOpen, setIsOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, isCollapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [isCollapsed])

  const desktopSidebarWidth = isCollapsed ? 'md:ml-24' : 'md:ml-80'
  const desktopSidebarSize = isCollapsed ? 'md:w-24' : 'md:w-80'
  const userInitials = getEmailInitials(user?.email)

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-full w-80 transform flex-col overflow-hidden border-r border-white/70 bg-white/70 px-5 py-6 shadow-2xl shadow-slate-300/40 backdrop-blur-xl transition-all duration-300 md:translate-x-0 ${desktopSidebarSize} ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className={`mb-8 flex shrink-0 justify-center ${isCollapsed ? '' : 'pt-2'}`}>
            {isCollapsed ? (
              <img src="/isotipo_agroKit.png" alt="Agrokit" className="h-12 w-12 object-contain" />
            ) : (
              <img src="/logo_AgroKit.png" alt="Agrokit" className="h-24 w-full max-w-[220px] object-contain" />
            )}
          </div>

          <nav className="agrokit-sidebar-scroll -mx-2 flex-1 space-y-3 overflow-y-auto px-2 pb-6">
            {mainNavItems
              .filter((item) => hasPermission(item.moduleKey, 'view'))
              .map((item) => (
                <SidebarLink key={item.to} item={item} collapsed={isCollapsed} onNavigate={() => setIsOpen(false)} />
              ))}

            {groupedNavItems
              .filter((group) => hasPermission(group.moduleKey, 'view'))
              .map((group) =>
                isCollapsed ? (
                  <div key={group.label} className="space-y-3 pt-2">
                    {group.items.map((item) => (
                      <SidebarLink key={item.to} item={item} collapsed={true} onNavigate={() => setIsOpen(false)} />
                    ))}
                  </div>
                ) : (
                  <div key={group.label} className="space-y-3 pt-5">
                    <div className="px-3 text-[13px] font-medium uppercase tracking-[0.2em] text-slate-500">
                      {group.label}
                    </div>
                    <div className="space-y-3">
                      {group.items.map((item) => (
                        <SidebarLink key={item.to} item={item} collapsed={false} onNavigate={() => setIsOpen(false)} />
                      ))}
                    </div>
                  </div>
                ),
              )}
          </nav>

          <div className={`shrink-0 border-t border-slate-200/80 pt-5 ${isCollapsed ? 'flex flex-col items-center gap-3' : 'flex items-center gap-4'}`}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-base font-semibold text-slate-950 shadow-inner">
              {userInitials}
            </div>
            {!isCollapsed ? (
              <p className="min-w-0 flex-1 truncate text-[17px] font-medium text-slate-950" title={user?.email}>
                {user?.email}
              </p>
            ) : null}
            <button
              type="button"
              onClick={logout}
              title="Cerrar sesion"
              aria-label="Cerrar sesion"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-800 transition hover:bg-white/80 hover:text-emerald-700"
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <div className={`min-w-0 flex-1 transition-all duration-300 ${desktopSidebarWidth}`}>
          <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsOpen((value) => !value)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 md:hidden"
                aria-label="Abrir menu"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsCollapsed((current) => !current)}
                className="hidden h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white/80 text-slate-700 shadow-sm transition hover:bg-slate-50 md:inline-flex"
                aria-label={isCollapsed ? 'Expandir menu lateral' : 'Colapsar menu lateral'}
                title={isCollapsed ? 'Expandir menu lateral' : 'Colapsar menu lateral'}
              >
                <PanelToggleIcon className={`h-4 w-4 ${isCollapsed ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <label className="flex min-w-0 items-center gap-3 text-sm text-slate-700">
              <span className="hidden whitespace-nowrap font-semibold sm:inline">Evento a mostrar:</span>
              <select
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(event.target.value)}
                className="h-10 w-[min(54vw,340px)] rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Seleccionar evento</option>
                {events.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <span
              title={isOnline ? 'Conexion activa' : 'Sin conexion'}
              className={`ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full ${
                isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              <SignalIcon className="h-4 w-4" />
            </span>
          </header>

          <main className="min-w-0 p-3 md:p-5 xl:p-6">
            <Outlet />
          </main>
        </div>
      </div>

      {isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/30 md:hidden"
          aria-label="Cerrar menu"
        />
      ) : null}
    </div>
  )
}
