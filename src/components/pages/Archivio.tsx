import { useReducer, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, Calendar, Tag, Edit3, X, User, Trash2, AlertTriangle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getRelazioni, deleteRelazione } from '../../data/relazioniData'
import { getPazienteById } from '../../data/pazientiData'
import { ARCHIVIO_INIT, archivioReducer } from '../state/archivioState'
import type { Relazione } from '../../core/types'

const MESI = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']
function formatData(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`
}

export default function Archivio() {
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(archivioReducer, ARCHIVIO_INIT)
  const { relazioni, loading, query, filtroTipo, aperta, pazienteAperta, confirmDelete } = state

  useEffect(() => { load() }, [])

  async function load() {
    const data = await getRelazioni()
    dispatch({ type: 'LOADED', data })
  }

  async function handleApri(relazione: Relazione) {
    const paziente = relazione.paziente_id ? await getPazienteById(relazione.paziente_id) : null
    dispatch({ type: 'APRI', relazione, paziente })
  }

  function handleModifica(relazione: Relazione) {
    if (!relazione.wizard_snapshot) {
      alert('Questa relazione non ha uno snapshot del wizard salvato (probabilmente importata da DOCX) — non può essere riaperta per la modifica, ma puoi comunque consultarla.')
      return
    }
    navigate(`/modifica?relazioneId=${encodeURIComponent(relazione.id)}`)
  }

  function handleModificaTestoDiretto(relazione: Relazione) {
    const snap = (relazione.wizard_snapshot || {}) as any
    navigate('/risultato', {
      state: {
        wizardData: {
          _relazioneId: relazione.id,
          _pazienteId: relazione.paziente_id,
          _isDirectEdit: true,
          _sourceRoute: '/archivio',
          anagrafica: {
            nome: pazienteAperta?.nome || '',
            cognome: pazienteAperta?.cognome || '',
            dataNascita: pazienteAperta?.data_nascita || '',
            genere: pazienteAperta?.genere || 'maschio',
            scuola: pazienteAperta?.scuola || '',
            classe: pazienteAperta?.classe || '',
          },
          cognitivo: snap.cognitivo || { somministrato: false, punteggi: {} },
          nepsy: snap.nepsy || { somministrato: false, punteggi: {} },
          sezioni_attive: snap.sezioni_attive || relazione.tag || [],
          test_risultati: snap.test_risultati || {},
        },
        testoPreesistente: relazione.testo_markdown
      }
    })
  }

  async function handleEliminaConfermato() {
    if (!confirmDelete) return
    await deleteRelazione(confirmDelete)
    dispatch({ type: 'ELIMINA', id: confirmDelete })
  }

  const filtrate = relazioni.filter((r: Relazione) => {
    const matchQuery = !query || (r.titolo || '').toLowerCase().includes(query.toLowerCase()) ||
      (r.testo_markdown || '').toLowerCase().includes(query.toLowerCase())
    const matchTipo = !filtroTipo || r.tipo_relazione === filtroTipo
    return matchQuery && matchTipo
  })

  const tipiDisponibili = [...new Set<string>(relazioni.map((r: Relazione) => r.tipo_relazione).filter(Boolean) as string[])]

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {r.wizard_snapshot && (
                      <span style={{ fontSize: 10.5, color: 'var(--accent-dk)', background: 'var(--accent-lt)', padding: '3px 8px', borderRadius: 20 }}>
                        Modificabile
                      </span>
                    )}
                    {/* Pulsante elimina diretto sulla card */}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); dispatch({ type: 'ASK_DELETE', id: r.id }) }}
                      title="Elimina relazione"
                      style={{
                        background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                        padding: '4px 7px', cursor: 'pointer', color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center',
                        transition: 'border-color 0.15s, color 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--danger)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
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

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {aperta.wizard_snapshot && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleModifica(aperta)}>
                    <Edit3 size={13} /> Modifica con Wizard
                  </button>
                )}
                <button className="btn btn-primary btn-sm" style={aperta.wizard_snapshot ? { background: 'none', border: '1px solid var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => handleModificaTestoDiretto(aperta)}>
                  <Edit3 size={13} /> Modifica testo direttamente
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => dispatch({ type: 'CHIUDI' })}>
                  Chiudi
                </button>
                {/* Elimina nel pannello dettaglio */}
                <button
                  className="btn btn-sm"
                  style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--danger)', color: 'var(--danger)' }}
                  onClick={() => dispatch({ type: 'ASK_DELETE', id: aperta.id })}
                >
                  <Trash2 size={13} /> Elimina
                </button>
              </div>

              {!aperta.wizard_snapshot && (
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
                  Questa relazione non ha dati del wizard salvati (probabilmente importata da un DOCX esistente). Puoi comunque modificarne il testo direttamente ed esportare un nuovo DOCX.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Dialog di conferma eliminazione */}
        {confirmDelete && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
          }}>
            <div style={{
              background: 'var(--bg-panel)', borderRadius: 12, padding: '28px 32px',
              maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <AlertTriangle size={20} color="var(--danger)" />
                <span style={{ fontSize: 15, fontWeight: 600 }}>Elimina relazione</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
                Questa azione è <strong>irreversibile</strong>. La relazione verrà eliminata definitivamente dal database e non potrà essere recuperata.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={handleEliminaConfermato}
                >
                  <Trash2 size={14} /> Elimina definitivamente
                </button>
                <button className="btn btn-secondary" onClick={() => dispatch({ type: 'CANCEL_DELETE' })}>
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
