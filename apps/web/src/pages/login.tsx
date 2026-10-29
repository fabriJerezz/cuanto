import { useState } from 'react'
import { Outlet } from 'react-router'
import { ErrorText, Glass } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, queryClient, useApi, useSave } from '@/lib/api'

function Login() {
  const [pin, setPin] = useState('')
  const login = useSave(() => api.post('/auth/login', { pin }))
  return (
    <div className="flex min-h-dvh items-center justify-center p-5">
      <Glass className="w-full max-w-[360px] rounded-[36px] p-8">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (pin) login.mutate(undefined, { onError: () => setPin('') })
          }}
        >
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.02em]">Cuánto</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">Ingresá tu PIN para entrar.</p>
          </div>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            aria-label="PIN"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="num text-center text-2xl tracking-[0.5em]"
          />
          <ErrorText error={login.error} />
          <Button type="submit" disabled={!pin || login.isPending}>
            Entrar
          </Button>
        </form>
      </Glass>
    </div>
  )
}

// Everything behind the PIN. "me" answers 204 with a valid session cookie, 401 otherwise.
export function AuthGate() {
  const me = useApi<void>('/auth/me')
  if (me.isPending) return null
  return me.isError ? <Login /> : <Outlet />
}

export function useLogout() {
  return () => api.post('/auth/logout', {}).then(() => queryClient.resetQueries())
}
