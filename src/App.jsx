import { useEffect, useReducer } from 'react'
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
import PlaceholderPage      from './PlaceholderPage'

function reducer(state, action) {
  switch (action.type) {
    case 'SET_SESSION':  return { ...state, session: action.session, loading: false }
    case 'SET_PAGE':     return { ...state, page: action.page, wizardResult: null, wizardDatiIniziali: null }
    case 'WIZARD_DONE':  return { ...state, page: 'risultato', wizardResult: action.data }
    case 'APRI_IN_WIZARD': return { ...state, page: 'nuova', wizardDatiIniziali: action.data, wizardResult: null }
    default: return state
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, {
    session: null, loading: true, page: 'dashboard', wizardResult: null, wizardDatiIniziali: null,
  })
  const { session, loading, page, wizardResult, wizardDatiIniziali } = state

  useEffect(() => {
    if (USE_MOCK) {
      dispatch({ type: 'SET_SESSION', session: { mock: true } })
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => dispatch({ type: 'SET_SESSION', session }))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => dispatch({ type: 'SET_SESSION', session: s }))
    return () => subscription.unsubscribe()
  }, [])

  function onNav(p) { dispatch({ type: 'SET_PAGE', page: p }) }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  if (!session) return <AuthScreen />

  function renderPage() {
    switch (page) {
      case 'dashboard': return <Dashboard onNav={onNav} onApriInWizard={data => dispatch({ type: 'APRI_IN_WIZARD', data })} />
      case 'import':    return <ImportRelazioni />
      case 'stile':     return <ProfiloStile />
      case 'professionista': return <ProfiloProfessionista />
      case 'nuova':     return (
        <WizardNuovaRelazione
          key={wizardDatiIniziali?._relazioneId || wizardDatiIniziali?._sessionId || 'nuova'}
          datiIniziali={wizardDatiIniziali}
          onGenera={data => dispatch({ type: 'WIZARD_DONE', data })}
          onAnnullaModifica={() => onNav('nuova')}
        />
      )
      case 'risultato': return <RisultatoGenerazione wizardData={wizardResult} onBack={() => onNav('nuova')} />
      case 'archivio':  return <Archivio onApriInWizard={data => dispatch({ type: 'APRI_IN_WIZARD', data })} />
      default:          return <PlaceholderPage page={page} />
    }
  }

  let activeSidebarTab = page
  if (page === 'risultato') {
    activeSidebarTab = 'nuova'
  } else if (page === 'nuova' && wizardDatiIniziali) {
    activeSidebarTab = wizardDatiIniziali._relazioneId ? 'archivio' : 'dashboard'
  }

  return (
    <div className="app-shell">
      <Sidebar current={activeSidebarTab} onNav={onNav} mockMode={USE_MOCK} />
      <main className="main-content">{renderPage()}</main>
    </div>
  )
}
