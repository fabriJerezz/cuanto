import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Shell } from '@/components/layout'
import { queryClient } from '@/lib/api'
import Home from '@/pages/home'
import { MovementDetail } from '@/pages/movements'
import { AuthGate } from '@/pages/login'
import Onboarding from '@/pages/onboarding'
import Payments, { CategoryPage, Pay } from '@/pages/payments'
import { EventPage, PersonPage, ReceiveReturn, Settle } from '@/pages/people'
import Settings from '@/pages/settings'
import './index.css'

const router = createBrowserRouter([
  {
    element: <AuthGate />,
    children: [
      { path: '/bienvenida', element: <Onboarding /> },
      {
        element: <Shell />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/movimientos/:id', element: <MovementDetail /> },
          { path: '/personas/:id', element: <PersonPage /> },
          { path: '/personas/:id/saldar', element: <Settle /> },
          { path: '/saldar', element: <ReceiveReturn /> },
          { path: '/eventos/:id', element: <EventPage /> },
          { path: '/pagos', element: <Payments tab="pagos" /> },
          { path: '/pagos/presupuestos', element: <Payments tab="presupuestos" /> },
          { path: '/pagos/eventos', element: <Payments tab="eventos" /> },
          { path: '/pagos/categorias', element: <Payments tab="categorias" /> },
          { path: '/pagos/:kind/:id', element: <Pay /> },
          { path: '/categorias/:id', element: <CategoryPage /> },
          { path: '/configuracion', element: <Settings /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
