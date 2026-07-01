import { useReducer, useEffect } from 'react'
import { Search, FileText, Calendar, Tag, Edit3, Eye, X, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getRelazioni, getRelazioneById, getPazienteById, USE_MOCK } from './dataService'

const INIT = {
  relazioni: [], loading: true, query: '', filtroTipo: '',
  aperta: null,         // relazione attualmente visualizzata in dettaglio
  pazienteAperta: null, // anagrafica della relazione aperta (per mostrarla, mai per Gemini)
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOADED':      return { ...state, relazioni: action.data, loading: false }
    case 'QUERY':       return { ...state, query: action.value }
    case 'FILTRO_TIPO': return { ...state, filtroTipo: action.value }
    case 'APRI':        return { ...state, aperta: action.relazione, pazienteAperta: action.paziente }
    case 'CHIUDI':       return { ...state, aperta: null, pazienteAperta: null }
    default: return state
  }
}

const MESI = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']
function formatData(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`
}

export default function Archivio({ onApriInWizard }) {
  const [state, dispatch] = useReducer(reducer, INIT)
  const { relazioni, loading, query, filtroTipo, aperta, pazienteAperta } = state

  useEffect(() => { load() }, [])

  async function load() {
    const data = await getRelazioni()
    dispatch({ type: 'LOADED', data })
  }

  async function handleApri(relazione) {
    const paziente = relazione.paziente_id ? await getPazienteById(relazione.paziente_id) : null
    dispatch({ type: 'APRI', relazione, paziente })
  }

  function handleModifica(relazione) {
    if (!relazione.wizard_snapshot) {
      alert('Questa relazione non ha uno snapshot del wizard salvato (probabilmente importata da DOCX) — non può essere riaperta per la modifica, ma puoi comunque consultarla.')
      return
    }
    // Ricompone i dati per il wizard: snapshot delle risposte + anagrafica
    // recuperata separatamente da `pazienti` + riferimenti per l'update
    onApriInWizard({
      ...relazione.wizard_snapshot,
      anagrafica: pazienteAperta ? {
        nome: pazienteAperta.nome, cognome: pazienteAperta.cognome,
        data_nascita: pazienteAperta.data_nascita, scuola_classe: pazienteAperta.scuola_classe,
      } : { nome: '', cognome: '', data_nascita: '', scuola_classe: '' },
      _relazioneId: relazione.id,
      _pazienteId: relazione.paziente_id,
    })
  }

  const filtrate = relazioni.filter(r => {
    const matchQuery = !query || (r.titolo || '').toLowerCase().includes(query.toLowerCase()) ||
      (r.testo_markdown || '').toLowerCase().includes(query.toLowerCase())
    const matchTipo = !filtroTipo || r.tipo_relazione === filtroTipo
    return matchQuery && matchTipo
  })

  const tipiDisponibili = [...new Set(relazioni.map(r => r.tipo_relazione).filter(Boolean))]

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Archivio</div>
          <div className="topbar-sub">{relazioni.length} relazioni salvate</div>
        </div>
      </div>

      <div className="page-body">
        {/* Ricerca e filtri */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-input" style={{ paddingLeft: 36 }}
              placeholder="Cerca per titolo o contenuto…"
              value={query} onChange={e => dispatch({ type: 'QUERY', value: e.target.value })}
            />
          </div>
          {tipiDisponibili.length > 0 && (
            <select className="form-select" style={{ maxWidth: 200 }} value={filtroTipo} onChange={e => dispatch({ type: 'FILTRO_TIPO', value: e.target.value })}>
              <option value="">Tutti i tipi</option>
              {tipiDisponibili.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Caricamento…</p>}

        {!loading && filtrate.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <FileText size={32} color="var(--accent)" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>
              {relazioni.length === 0 ? 'Nessuna relazione salvata ancora.' : 'Nessun risultato per questa ricerca.'}
            </p>
          </div>
        )}

        {!loading && filtrate.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtrate.map(r => (
              <div key={r.id} className="card" style={{ padding: 16, cursor: 'pointer' }} onClick={() => handleApri(r)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{r.titolo || 'Senza titolo'}</div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {formatData(r.created_at)}</span>
                      {r.tipo_relazione && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Tag size={12} /> {r.tipo_relazione}</span>}
                      <span>{r.tipo === 'importata' ? 'Importata' : 'Generata'}</span>
                    </div>
                  </div>
                  {r.wizard_snapshot && (
                    <span style={{ fontSize: 10.5, color: 'var(--accent-dk)', background: 'var(--accent-lt)', padding: '3px 8px', borderRadius: 20, flexShrink: 0 }}>
                      Modificabile
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pannello dettaglio relazione aperta */}
        {aperta && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20,
          }} onClick={() => dispatch({ type: 'CHIUDI' })}>
            <div className="card" style={{ maxWidth: 700, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 28 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{aperta.titolo}</div>
                  {pazienteAperta && (pazienteAperta.nome || pazienteAperta.cognome) && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <User size={12} /> {pazienteAperta.nome} {pazienteAperta.cognome}
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'CHIUDI' })}><X size={16} /></button>
              </div>

              <div className="markdown-profile" style={{ marginBottom: 20, maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {aperta.testo_markdown || ''}
                </ReactMarkdown>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {aperta.wizard_snapshot && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleModifica(aperta)}>
                    <Edit3 size={13} /> Apri e modifica
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => dispatch({ type: 'CHIUDI' })}>
                  Chiudi
                </button>
              </div>

              {!aperta.wizard_snapshot && (
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
                  Questa relazione non ha dati del wizard salvati (probabilmente importata da un DOCX esistente), quindi può essere solo consultata, non riaperta per la modifica guidata.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
