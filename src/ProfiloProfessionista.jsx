import { useEffect, useReducer } from 'react'
import { Save, BadgeCheck } from 'lucide-react'
import { getProfiloProfessionista, saveProfiloProfessionista, USE_MOCK } from './dataService'

const INIT = {
  loading: true,
  saving: false,
  msg: null,
  data: {
    nome_completo: '',
    genere: '',
    titolo: '',
    specializzazione: '',
    email: '',
    telefono: '',
    indirizzo: '',
    citta: '',
    partita_iva: '',
    codice_fiscale: '',
  },
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_DONE': return { ...state, loading: false, data: { ...state.data, ...(action.data || {}) } }
    case 'SET': return { ...state, data: { ...state.data, [action.k]: action.v } }
    case 'SAVE_START': return { ...state, saving: true, msg: null }
    case 'SAVE_DONE': return { ...state, saving: false, msg: { type: 'ok', text: 'Scheda professionista salvata con successo.' } }
    case 'SAVE_ERR': return { ...state, saving: false, msg: { type: 'err', text: action.text } }
    default: return state
  }
}

export default function ProfiloProfessionista() {
  const [state, dispatch] = useReducer(reducer, INIT)
  const { loading, saving, msg, data } = state

  useEffect(() => {
    ;(async () => {
      const profilo = await getProfiloProfessionista()
      dispatch({ type: 'LOAD_DONE', data: profilo })
    })()
  }, [])

  async function salva() {
    dispatch({ type: 'SAVE_START' })
    try {
      await saveProfiloProfessionista(data)
      dispatch({ type: 'SAVE_DONE' })
    } catch (e) {
      dispatch({ type: 'SAVE_ERR', text: e.message || 'Errore durante il salvataggio.' })
    }
  }

  if (loading) {
    return (
      <div className="page-body">
        <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: 34 }}>
          <span className="spinner" style={{ width: 22, height: 22 }} />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Scheda professionista</div>
          <div className="topbar-sub">Compila una sola volta i tuoi dati: verranno usati automaticamente nel DOCX esportato</div>
        </div>
      </div>

      <div className="page-body">
        {USE_MOCK && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <span>Modalità demo: salvataggio locale nel browser.</span>
          </div>
        )}

        {msg?.type === 'ok' && (
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            <BadgeCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{msg.text}</span>
          </div>
        )}

        {msg?.type === 'err' && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <span>{msg.text}</span>
          </div>
        )}

        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Dati intestazione e firma</div>

          <div className="meta-row">
            <div className="form-group">
              <label className="form-label">Nome e cognome</label>
              <input className="form-input" value={data.nome_completo || ''} onChange={e => dispatch({ type: 'SET', k: 'nome_completo', v: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Genere</label>
              <select
                className="form-select"
                value={data.genere || ''}
                onChange={e => dispatch({ type: 'SET', k: 'genere', v: e.target.value })}
              >
                <option value="">— seleziona —</option>
                <option value="uomo">Uomo</option>
                <option value="donna">Donna</option>
                <option value="non_binario">Non binario</option>
              </select>
            </div>
          </div>

          <div className="meta-row">
            <div className="form-group">
              <label className="form-label">Titolo professionale</label>
              <input className="form-input" placeholder="es. Psicologa" value={data.titolo || ''} onChange={e => dispatch({ type: 'SET', k: 'titolo', v: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Specializzazione</label>
            <input className="form-input" placeholder="es. Esperta in Psicopatologia dell'Apprendimento" value={data.specializzazione || ''} onChange={e => dispatch({ type: 'SET', k: 'specializzazione', v: e.target.value })} />
          </div>

          <div className="meta-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={data.email || ''} onChange={e => dispatch({ type: 'SET', k: 'email', v: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefono</label>
              <input className="form-input" value={data.telefono || ''} onChange={e => dispatch({ type: 'SET', k: 'telefono', v: e.target.value })} />
            </div>
          </div>

          <div className="meta-row">
            <div className="form-group">
              <label className="form-label">Indirizzo</label>
              <input className="form-input" value={data.indirizzo || ''} onChange={e => dispatch({ type: 'SET', k: 'indirizzo', v: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Città</label>
              <input className="form-input" value={data.citta || ''} onChange={e => dispatch({ type: 'SET', k: 'citta', v: e.target.value })} />
            </div>
          </div>

          <div className="meta-row">
            <div className="form-group">
              <label className="form-label">Partita IVA</label>
              <input className="form-input" value={data.partita_iva || ''} onChange={e => dispatch({ type: 'SET', k: 'partita_iva', v: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Codice Fiscale</label>
              <input className="form-input" value={data.codice_fiscale || ''} onChange={e => dispatch({ type: 'SET', k: 'codice_fiscale', v: e.target.value })} />
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={salva} disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Salvo...</> : <><Save size={14} /> Salva scheda</>}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
