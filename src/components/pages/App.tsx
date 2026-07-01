import { useEffect, useReducer, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { supabase } from '../../core/supabase'
import { USE_MOCK } from '../../core/config'
import Sidebar from '../layout/Sidebar'

const AuthScreen = lazy(() => import('./AuthScreen'))
const Dashboard = lazy(() => import('./Dashboard'))
const ImportRelazioni = lazy(() => import('./ImportRelazioni'))
const ProfiloStile = lazy(() => import('./ProfiloStile'))
const ProfiloProfessionista = lazy(() => import('./ProfiloProfessionista'))
const WizardNuovaRelazione = lazy(() => import('./WizardNuovaRelazione'))
const RisultatoGenerazione = lazy(() => import('./RisultatoGenerazione'))
const Archivio = lazy(() => import('./Archivio'))

function reducer(state, action) {
  switch (action.type) {
    case 'SET_SESSION':  return { ...state, session: action.session, loading: false }
    default: return state
  }
}

function ProtectedRoute({ session }) {
  if (!session) return <Navigate to="/auth" replace />
  return <Outlet />
}

function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar mockMode={USE_MOCK} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, {
    session: null, loading: true,
  })
  const { session, loading } = state

  useEffect(() => {
    if (USE_MOCK) {
      dispatch({ type: 'SET_SESSION', session: { mock: true } })
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => dispatch({ type: 'SET_SESSION', session }))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => dispatch({ type: 'SET_SESSION', session: s }))
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/auth" element={session ? <Navigate to="/dashboard" replace /> : <AuthScreen />} />
        <Route element={<ProtectedRoute session={session} />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/bozza" element={<Dashboard mode="bozze" />} />
            <Route path="/bozza/riprendi" element={<WizardNuovaRelazione />} />
            <Route path="/import" element={<ImportRelazioni />} />
            <Route path="/stile" element={<ProfiloStile />} />
            <Route path="/professionista" element={<ProfiloProfessionista />} />
            <Route path="/archivio" element={<Archivio />} />
            <Route path="/nuova" element={<WizardNuovaRelazione />} />
            <Route path="/modifica" element={<WizardNuovaRelazione />} />
            <Route path="/risultato" element={<RisultatoGenerazione />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
