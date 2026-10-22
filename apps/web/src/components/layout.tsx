import { Navigate, NavLink, Outlet, useLocation, useMatch } from 'react-router'
import { useApi, type Account } from '@/lib/api'
import { cn } from '@/lib/utils'

// Stroke icons from the design (24×24, 1.75 stroke).
const paths = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  movements: <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3.25 3.25 0 0 1 0 5.6M18 14.4c1.7.8 3 2.8 3 5.6" />
    </>
  ),
  payments: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
}

export function Icon({ name, size = 24, className }: { name: keyof typeof paths; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'plus' ? 2.25 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name]}
    </svg>
  )
}

const NAV = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/movimientos', label: 'Movimientos', icon: 'movements' },
  { to: '/personas', label: 'Personas', icon: 'people' },
  { to: '/pagos', label: 'Pagos', icon: 'payments' },
] as const

function Sidebar() {
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex h-12 items-center gap-3 rounded-2xl px-3.5 text-sm',
      isActive ? 'bg-brand/13 font-bold text-brand-dark' : 'font-semibold text-muted-foreground hover:bg-white/40',
    )
  return (
    <nav
      aria-label="Navegación principal"
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-white/85 bg-white/50 px-3.5 py-7 backdrop-blur-xl backdrop-saturate-170 lg:flex"
    >
      <div className="px-3.5 pb-5.5 text-lg font-bold tracking-[-0.01em]">Cuánto</div>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className={link}>
          <Icon name={n.icon} size={22} />
          <span>{n.label}</span>
        </NavLink>
      ))}
      <div className="flex-1" />
      <NavLink to="/configuracion" className={link}>
        <Icon name="settings" size={22} />
        <span>Configuración</span>
      </NavLink>
    </nav>
  )
}

function TabBar() {
  const item = ({ isActive }: { isActive: boolean }) =>
    cn('flex size-12 items-center justify-center rounded-full', isActive ? 'bg-brand/14 text-brand' : 'text-muted-foreground')
  const [home, mov, ...rest] = NAV
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-5 pb-[max(16px,env(safe-area-inset-bottom))] lg:hidden">
      <nav
        aria-label="Navegación principal"
        className="mx-auto flex h-[62px] max-w-md items-center justify-around rounded-[31px] border border-white/90 bg-white/66 px-2 shadow-[0_12px_32px_rgba(20,50,40,0.14)] backdrop-blur-xl backdrop-saturate-170"
      >
        {[home, mov].map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} aria-label={n.label} className={item}>
            <Icon name={n.icon} />
          </NavLink>
        ))}
        <NavLink
          to="/movimientos/nuevo"
          aria-label="Nuevo movimiento"
          className="flex size-[50px] items-center justify-center rounded-full bg-foreground text-white shadow-[0_6px_16px_rgba(16,32,27,0.3)]"
        >
          <Icon name="plus" />
        </NavLink>
        {rest.map((n) => (
          <NavLink key={n.to} to={n.to} aria-label={n.label} className={item}>
            <Icon name={n.icon} />
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function Shell() {
  const { pathname } = useLocation()
  const accounts = useApi<Account[]>('/accounts')
  // Full-screen forms on mobile hide the tab bar, as in the design.
  const noTabs = useMatch('/movimientos/nuevo') || pathname.endsWith('/editar') || pathname === '/configuracion'

  if (accounts.data?.length === 0) return <Navigate to="/bienvenida" replace />

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className={cn('flex min-w-0 flex-1 flex-col gap-4 px-5 pt-6 lg:gap-[22px] lg:px-11 lg:py-8', noTabs ? 'pb-32 lg:pb-8' : 'pb-28')}>
        <Outlet />
      </main>
      {!noTabs && <TabBar />}
    </div>
  )
}
