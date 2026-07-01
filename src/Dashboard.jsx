import { useEffect, useReducer } from 'react'
import { FileText, Upload, TrendingUp, Clock, Trash2 } from 'lucide-react'
import { getRelazioni, getPazienti, getSessioniInCorso, deleteSessione } from './dataService'

const init = { stats: { totale: 0, questo_mese: 0, pazienti: 0 }, recenti: [], sospese: [], loading: true }

function reducer(state, action) {
  switch (action.type) {
    case 'LOADED': return { ...state, ...action.payload, loading: false }
    case 'DELETE_SOSPESA': return { ...state, sospese: state.sospese.filter(s => s.id !== action.id) }
    default: return state
  }
}

const MESI = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']
function formatData(iso) {
  const d = new Date(iso)
  const dateStr = `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`
  const pad = (n) => String(n).padStart(2, '0')
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return `${dateStr} ${timeStr}`
}

export default function Dashboard({ onNav, onApriInWizard }) {
  const [state, dispatch] = useReducer(reducer, init)
  const { stats, recenti, sospese, loading } = state

  useEffect(() => {
    async function load() {
      const [relazioni, pazienti, sospese] = await Promise.all([
        getRelazioni(),
        getPazienti(),
        getSessioniInCorso(),
      ])
      const ora = new Date()
      const questoMese = relazioni.filter(r => {
        const d = new Date(r.created_at)
        return d.getMonth() === ora.getMonth() && d.getFullYear() === ora.getFullYear()
      })
      dispatch({ type: 'LOADED', payload: {
        stats: { totale: relazioni.length, questo_mese: questoMese.length, pazienti: pazienti.length },
        recenti: relazioni.slice(0, 5),
        sospese,
      }})
    }
    load()
  }, [])

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Pannello</div>
          <div className="topbar-sub">Benvenuta — buon lavoro</div>
        </div>
        <button className="btn btn-primary" onClick={() => onNav('nuova')}>
          <FileText size={15} /> Nuova relazione
        </button>
      </div>

      <div className="page-body">
        <div className="stats-row">
          {[
            { v: stats.totale,       l: 'Relazioni totali' },
            { v: stats.questo_mese,  l: 'Questo mese' },
            { v: stats.pazienti,     l: 'Pazienti in archivio' },
          ].map(({ v, l }) => (
            <div key={l} className="stat-card">
              <div className="stat-value">{loading ? '—' : v}</div>
              <div className="stat-label">{l}</div>
            </div>
          ))}
        </div>

        {/* Sessioni wizard sospese */}
        {sospese.length > 0 && (
          <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent)' }}>
            <div className="card-title">Bozze in corso</div>
            {sospese.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Wizard avviato il {formatData(s.created_at)} — {s.risposte_wizard?.tipo || 'tipo non definito'}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => onApriInWizard({ ...s.risposte_wizard, _sessionId: s.id })}>
                    Riprendi
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ color: 'var(--danger)', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={async () => {
                      if (confirm('Vuoi eliminare questa bozza?')) {
                        const ok = await deleteSessione(s.id)
                        if (ok) dispatch({ type: 'DELETE_SOSPESA', id: s.id })
                      }
                    }}
                    title="Elimina bozza"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Azioni rapide */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Azioni rapide</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary"   onClick={() => onNav('nuova')}>    <FileText size={15} />   Nuova relazione</button>
            <button className="btn btn-secondary" onClick={() => onNav('import')}>   <Upload size={15} />     Importa relazioni</button>
            <button className="btn btn-secondary" onClick={() => onNav('stile')}>    <TrendingUp size={15} /> Profilo di stile</button>
          </div>
        </div>

        {/* Recenti */}
        <div className="card">
          <div className="card-title">Ultime relazioni</div>
          {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Caricamento…</p>}
          {!loading && recenti.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                Nessuna relazione ancora. Inizia importando le relazioni esistenti.
              </p>
              <button className="btn btn-secondary btn-sm" onClick={() => onNav('import')}>
                <Upload size={13} /> Importa relazioni
              </button>
            </div>
          )}
          {!loading && recenti.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <FileText size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.titolo || 'Senza titolo'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {r.tipo_relazione || '—'} · {r.tipo === 'importata' ? 'importata' : 'generata'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <Clock size={12} /> {formatData(r.created_at)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
