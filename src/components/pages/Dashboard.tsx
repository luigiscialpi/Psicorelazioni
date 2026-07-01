import { useEffect, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Upload, Clock, Trash2 } from 'lucide-react'
import { getRelazioni } from '../../data/relazioniData'
import { getPazienti } from '../../data/pazientiData'
import { getSessioniInCorso, deleteSessione } from '../../data/sessioniData'
import { getProfiloProfessionista } from '../../data/profiloData'

const init = { stats: { totale: 0, questo_mese: 0, pazienti: 0 }, recenti: [], sospese: [], greeting: 'Benvenuta — buon lavoro', loading: true }

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

function getBozzaTitolo(sessione) {
  const wizard = sessione?.risposte_wizard || {}
  const titoloArchivio = String(wizard._relazioneTitolo || '').trim()
  const tipo = wizard.tipo || wizard.tipo_relazione || 'tipo non definito'

  if (wizard._relazioneId) {
    return titoloArchivio
      ? `Modifica da archivio: ${titoloArchivio}`
      : 'Modifica da archivio'
  }

  return `Bozza nuova relazione (${tipo})`
}

function getNomeBreve(nomeCompleto) {
  const cleaned = String(nomeCompleto || '').trim().replace(/\s+/g, ' ')
  if (!cleaned) return ''
  return cleaned.split(' ')[0]
}

function getSalutoDashboard(profiloProfessionista) {
  const fallback = "Benvenutə — buon lavoro";
  const nomeBreve = getNomeBreve(profiloProfessionista?.nome_completo)
  if (!nomeBreve) return fallback

  const genere = String(profiloProfessionista?.genere || '').trim().toLowerCase()
  const apertura = genere === 'uomo'
    ? 'Benvenuto'
    : (genere === 'non_binario' ? 'Benvenutə' : 'Benvenuta')

  return `${apertura} ${nomeBreve} — buon lavoro`
}

export default function Dashboard({ mode = 'dashboard' }) {
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(reducer, init)
  const { stats, recenti, sospese, greeting, loading } = state
  const isBozzePage = mode === 'bozze'

  useEffect(() => {
    async function load() {
      const [relazioni, pazienti, sospese, profiloProfessionista] = await Promise.all([
        getRelazioni(),
        getPazienti(),
        getSessioniInCorso(),
        getProfiloProfessionista(),
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
        greeting: getSalutoDashboard(profiloProfessionista),
      }})
    }
    load()
  }, [])

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">{isBozzePage ? 'Bozze in corso' : 'Pannello'}</div>
          <div className="topbar-sub">{isBozzePage ? 'Riprendi o elimina una bozza salvata automaticamente' : greeting}</div>
        </div>
        {!isBozzePage && (
          <button className="btn btn-primary" onClick={() => navigate('/nuova')}>
            <FileText size={15} /> Nuova relazione
          </button>
        )}
      </div>

      <div className="page-body">
        {!isBozzePage && (
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
        )}

        {/* Sessioni wizard sospese */}
        {sospese.length > 0 && (
          <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent)' }}>
            <div className="card-title">{isBozzePage ? 'Elenco bozze' : 'Bozze in corso'}</div>
            {sospese.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, paddingRight: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {getBozzaTitolo(s)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Ultimo salvataggio: {formatData(s.created_at)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/bozza/riprendi?sessionId=${encodeURIComponent(s.id)}`)}>
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

        {isBozzePage && !loading && sospese.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '42px 24px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5, marginBottom: 14 }}>
              Non ci sono bozze in corso al momento.
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/nuova')}>
              <FileText size={13} /> Avvia nuova relazione
            </button>
          </div>
        )}

        {/* Azioni rapide */}
        {/* {!isBozzePage && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Azioni rapide</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary"   onClick={() => navigate('/nuova')}>    <FileText size={15} />   Nuova relazione</button>
              <button className="btn btn-secondary" onClick={() => navigate('/import')}>   <Upload size={15} />     Importa relazioni</button>
              <button className="btn btn-secondary" onClick={() => navigate('/stile')}>    <TrendingUp size={15} /> Profilo di stile</button>
            </div>
          </div>
        )} */}

        {/* Recenti */}
        {!isBozzePage && (
          <div className="card">
            <div className="card-title">Ultime relazioni</div>
            {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Caricamento…</p>}
            {!loading && recenti.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                  Nessuna relazione ancora. Inizia importando le relazioni esistenti.
                </p>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/import')}>
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
        )}
      </div>
    </>
  )
}
