import { useReducer, useEffect } from 'react'
import { Sparkles, RefreshCw, Edit3, Check, AlertTriangle, FlaskConical, GitMerge, RotateCcw } from 'lucide-react'
import { getRelazioni, getProfiloStileCompleto, saveProfiloStile, USE_MOCK } from './dataService'
import { analizzaStile, aggiornaProfiloIncrementale, USE_MOCK_AI } from './geminiService'

// ── Reducer ────────────────────────────────────────────────
const INIT = {
  profilo:          '',       // testo Markdown del profilo attuale
  updatedAt:        null,     // timestamp ultimo aggiornamento
  numAnalizzate:    0,        // relazioni già nel profilo
  nuoveCount:       0,        // relazioni più recenti dell'ultimo aggiornamento
  totalCount:       0,        // totale relazioni in archivio
  loading:          true,
  analyzing:        false,
  editing:          false,
  draft:            '',
  saving:           false,
  msg:              null,     // { type: 'ok'|'warn'|'err', text }
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOADED':       return { ...state, ...action.payload, loading: false }
    case 'START_ANALISI':return { ...state, analyzing: true, msg: null }
    case 'ANALISI_DONE': return { ...state, analyzing: false, profilo: action.profilo,
                                  numAnalizzate: action.num, nuoveCount: 0,
                                  updatedAt: new Date().toISOString(),
                                  msg: { type: 'ok', text: action.msg } }
    case 'ANALISI_ERR':  return { ...state, analyzing: false, msg: { type: 'err', text: action.text } }
    case 'START_EDIT':   return { ...state, editing: true, draft: state.profilo }
    case 'DRAFT':        return { ...state, draft: action.text }
    case 'CANCEL_EDIT':  return { ...state, editing: false, draft: '' }
    case 'START_SAVE':   return { ...state, saving: true }
    case 'SAVE_DONE':    return { ...state, saving: false, editing: false,
                                  profilo: state.draft, draft: '',
                                  msg: { type: 'ok', text: 'Modifiche manuali salvate.' } }
    case 'MSG':          return { ...state, msg: action.msg }
    default:             return state
  }
}

// ── Render Markdown minimale ───────────────────────────────
function renderMd(md) {
  return md.split('\n').map((line, i) => {
    if (line.startsWith('# '))  return <h1 key={i} style={{ fontFamily: 'var(--font-serif)', fontSize: 20, marginBottom: 8, marginTop: i > 0 ? 20 : 0, color: 'var(--accent-dk)' }}>{line.slice(2)}</h1>
    if (line.startsWith('## ')) return <h2 key={i} style={{ fontSize: 14, fontWeight: 600, marginTop: 18, marginBottom: 6 }}>{line.slice(3)}</h2>
    if (line.startsWith('### '))return <h3 key={i} style={{ fontSize: 13, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>{line.slice(4)}</h3>
    if (line.startsWith('- '))  return <li key={i} style={{ marginLeft: 16, marginBottom: 3, fontSize: 13 }}>{line.slice(2)}</li>
    if (line.match(/^\d+\. /)) return <li key={i} style={{ marginLeft: 16, marginBottom: 3, fontSize: 13, listStyleType: 'decimal' }}>{line.replace(/^\d+\. /, '')}</li>
    if (line.startsWith('|'))   return <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, borderBottom: '1px solid var(--border)', padding: '4px 0' }}>{line}</div>
    if (line.startsWith('> '))  return <div key={i} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10, color: 'var(--text-muted)', fontSize: 12.5, margin: '8px 0' }}>{line.slice(2)}</div>
    if (line === '')            return <div key={i} style={{ height: 6 }} />
    return <p key={i} style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 4 }}>{line}</p>
  })
}

// ── Componente principale ──────────────────────────────────
export default function ProfiloStile() {
  const [state, dispatch] = useReducer(reducer, INIT)
  const { profilo, updatedAt, numAnalizzate, nuoveCount, totalCount,
          loading, analyzing, editing, draft, saving, msg } = state

  useEffect(() => { load() }, [])

  async function load() {
    const [profiloObj, relazioni] = await Promise.all([
      getProfiloStileCompleto(),
      getRelazioni(),
    ])

    // Conta quante relazioni sono state create dopo l'ultimo aggiornamento del profilo
    const ultimoAgg = profiloObj?.updated_at ? new Date(profiloObj.updated_at) : null
    const nuove = ultimoAgg
      ? relazioni.filter(r => new Date(r.created_at) > ultimoAgg)
      : relazioni

    dispatch({ type: 'LOADED', payload: {
      profilo:       profiloObj?.documento_stile || '',
      updatedAt:     profiloObj?.updated_at || null,
      numAnalizzate: profiloObj?.num_relazioni_analizzate || 0,
      nuoveCount:    nuove.length,
      totalCount:    relazioni.length,
    }})
  }

  // ── Analisi completa (da zero) ─────────────────────────
  async function handleAnalizzaCompleta() {
    dispatch({ type: 'START_ANALISI' })
    try {
      const relazioni = await getRelazioni()
      if (relazioni.length === 0) {
        dispatch({ type: 'MSG', msg: { type: 'warn', text: 'Nessuna relazione trovata. Importa prima alcune relazioni.' } })
        dispatch({ type: 'ANALISI_ERR', text: '' })
        return
      }
      const risultato = await analizzaStile(relazioni)
      await saveProfiloStile(risultato, relazioni.length)
      dispatch({ type: 'ANALISI_DONE', profilo: risultato, num: relazioni.length,
        msg: `Profilo generato analizzando ${relazioni.length} relazioni.` })
    } catch (e) {
      dispatch({ type: 'ANALISI_ERR', text: 'Errore durante l\'analisi: ' + e.message })
    }
  }

  // ── Aggiornamento incrementale ─────────────────────────
  async function handleAggiornamento() {
    dispatch({ type: 'START_ANALISI' })
    try {
      const relazioni  = await getRelazioni()
      const ultimoAgg  = updatedAt ? new Date(updatedAt) : null
      const nuove      = ultimoAgg
        ? relazioni.filter(r => new Date(r.created_at) > ultimoAgg)
        : relazioni

      if (nuove.length === 0) {
        dispatch({ type: 'MSG', msg: { type: 'warn', text: 'Nessuna relazione nuova da integrare.' } })
        dispatch({ type: 'ANALISI_ERR', text: '' })
        return
      }

      const risultato = await aggiornaProfiloIncrementale(profilo, nuove)
      await saveProfiloStile(risultato, totalCount)
      dispatch({ type: 'ANALISI_DONE', profilo: risultato, num: totalCount,
        msg: `Profilo aggiornato con ${nuove.length} nuova/e relazione/i. Corpus totale: ${totalCount}.` })
    } catch (e) {
      dispatch({ type: 'ANALISI_ERR', text: 'Errore durante l\'aggiornamento: ' + e.message })
    }
  }

  // ── Salva modifica manuale ─────────────────────────────
  async function handleSaveEdit() {
    dispatch({ type: 'START_SAVE' })
    await saveProfiloStile(draft, numAnalizzate)
    dispatch({ type: 'SAVE_DONE' })
  }

  // ── Colore badge relazioni nuove ───────────────────────
  const haNew = nuoveCount > 0

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Profilo di stile</div>
          <div className="topbar-sub">Come l'AI descrive il tuo modo di scrivere</div>
        </div>

        {!editing && !analyzing && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {profilo && (
              <button className="btn btn-secondary" onClick={() => dispatch({ type: 'START_EDIT' })}>
                <Edit3 size={14} /> Modifica
              </button>
            )}

            {/* Aggiornamento incrementale — mostrato solo se ci sono relazioni nuove */}
            {profilo && haNew && (
              <button className="btn btn-primary" onClick={handleAggiornamento}>
                <GitMerge size={14} />
                Integra {nuoveCount} nuova/e relazione/i
              </button>
            )}

            {/* Analisi completa — sempre disponibile */}
            <button
              className={`btn ${profilo ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleAnalizzaCompleta}
              title={profilo ? 'Rigenera il profilo da zero analizzando tutte le relazioni' : 'Genera il profilo di stile'}
            >
              <RotateCcw size={14} />
              {profilo ? 'Rigenera da zero' : 'Genera profilo'}
            </button>
          </div>
        )}
      </div>

      <div className="page-body">
        {/* Banner mock */}
        {(USE_MOCK || USE_MOCK_AI) && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <FlaskConical size={15} style={{ flexShrink: 0 }} />
            <span>
              {USE_MOCK_AI
                ? 'Gemini API non configurata — verrà usato un profilo di esempio e un aggiornamento simulato.'
                : 'Modalità demo attiva.'}
            </span>
          </div>
        )}

        {/* Banner relazioni nuove */}
        {!loading && profilo && haNew && !analyzing && (
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            <GitMerge size={15} style={{ flexShrink: 0 }} />
            <span>
              Hai <strong>{nuoveCount}</strong> relazione/i importata/e dopo l'ultimo aggiornamento del profilo
              ({updatedAt ? new Date(updatedAt).toLocaleDateString('it-IT') : '—'}).
              Usa <em>Integra</em> per aggiornare solo con le nuove, o <em>Rigenera da zero</em> per rianalizzare tutto.
            </span>
          </div>
        )}

        {/* Banner nessuna novità */}
        {!loading && profilo && !haNew && !analyzing && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={13} color="var(--accent)" />
            Profilo aggiornato — tutte le {totalCount} relazioni in archivio sono già state analizzate.
          </div>
        )}

        {/* Messaggio feedback */}
        {msg?.text && (
          <div
            className={msg.type === 'ok' ? 'alert alert-info' : msg.type === 'warn' ? 'alert alert-warn' : ''}
            style={msg.type === 'err'
              ? { background: 'var(--danger-lt)', border: '1px solid #f5c6c2', color: 'var(--danger)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13, marginBottom: 16 }
              : { marginBottom: 16 }}
          >
            {msg.text}
          </div>
        )}

        {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Caricamento…</p>}

        {/* Analisi in corso */}
        {analyzing && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <span className="spinner" style={{ width: 28, height: 28, margin: '0 auto 14px', display: 'block' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>Analisi in corso — può richiedere qualche secondo…</p>
          </div>
        )}

        {/* Nessun profilo */}
        {!loading && !profilo && !analyzing && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <Sparkles size={36} color="var(--accent)" style={{ margin: '0 auto 14px' }} />
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 8 }}>
              Nessun profilo generato
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 400, margin: '0 auto 20px', lineHeight: 1.6 }}>
              Importa alcune relazioni esistenti, poi clicca "Genera profilo" per analizzare il tuo stile di scrittura.
            </p>
            <button className="btn btn-primary" onClick={handleAnalizzaCompleta}>
              <Sparkles size={14} /> Genera profilo ora
            </button>
          </div>
        )}

        {/* Editor manuale */}
        {!loading && editing && (
          <div className="card">
            <div className="card-title">Modifica manuale del profilo</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
              Puoi integrare o correggere il profilo generato dall'AI. Le modifiche sono in Markdown.
            </p>
            <textarea
              className="form-textarea"
              value={draft}
              onChange={e => dispatch({ type: 'DRAFT', text: e.target.value })}
              style={{ minHeight: 500, fontFamily: 'monospace', fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <><span className="spinner" /> Salvo…</> : <><Check size={14} /> Salva modifiche</>}
              </button>
              <button className="btn btn-secondary" onClick={() => dispatch({ type: 'CANCEL_EDIT' })}>
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* Profilo visualizzato */}
        {!loading && profilo && !editing && !analyzing && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Profilo attuale</div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {numAnalizzate} relazioni analizzate
                {updatedAt && ` · aggiornato il ${new Date(updatedAt).toLocaleDateString('it-IT')}`}
              </span>
            </div>
            <div style={{ lineHeight: 1.7 }}>
              {renderMd(profilo)}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
