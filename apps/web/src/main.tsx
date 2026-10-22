import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Shell } from '@/components/layout'
import { queryClient } from '@/lib/api'
import Home from '@/pages/home'
import MovementFormPage from '@/pages/movement-form'
import Movements, { MovementDetail } from '@/pages/movements'
import Onboarding from '@/pages/onboarding'
import Payments, { CategoryPage, Pay } from '@/pages/payments'
import People, { EventPage, Settle } from '@/pages/people'
import Settings from '@/pages/settings'
import './index.css'

const router = createBrowserRouter([
  { path: '/bienvenida', element: <Onboarding /> },
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/movimientos', element: <Movements /> },
      { path: '/movimientos/nuevo', element: <MovementFormPage /> },
      { path: '/movimientos/:id', element: <MovementDetail /> },
      { path: '/movimientos/:id/editar', element: <MovementFormPage /> },
      { path: '/personas', element: <People /> },
      { path: '/personas/:id', element: <People /> },
      { path: '/personas/:id/saldar', element: <Settle /> },
      { path: '/eventos/:id', element: <EventPage /> },
      { path: '/pagos', element: <Payments tab="pagos" /> },
      { path: '/pagos/presupuestos', element: <Payments tab="presupuestos" /> },
      { path: '/pagos/:kind/:id', element: <Pay /> },
      { path: '/categorias/:id', element: <CategoryPage /> },
      { path: '/configuracion', element: <Settings /> },
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
