import { useEffect, useReducer } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { supabase } from './supabase'
import { USE_MOCK } from './dataService'
import AuthScreen          from './AuthScreen'
import Sidebar              from './Sidebar'
import Dashboard            from './Dashboard'
import ImportRelazioni      from './ImportRelazioni'
import ProfiloStile         from './ProfiloStile'
import ProfiloProfessionista from './ProfiloProfessionista'
import WizardNuovaRelazione from './WizardNuovaRelazione'
import RisultatoGenerazione from './RisultatoGenerazione'
import Archivio              from './Archivio'

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
  )
}
