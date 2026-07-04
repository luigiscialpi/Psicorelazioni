import { useReducer, useEffect, useCallback, useRef } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { FileDown, RotateCcw, Save, FlaskConical, RefreshCw, ShieldCheck } from 'lucide-react'
import { getProfiloStile, getProfiloProfessionista } from '../../data/profiloData'
import { getRelazioniSimilari, insertRelazione, updateRelazione } from '../../data/relazioniData'
import { upsertPazienteAnagrafica } from '../../data/pazientiData'
import { USE_MOCK } from '../../core/config'
import { generaRelazione, USE_MOCK_AI } from '../../services/geminiService'
import { sostituisciNomePlaceholder } from '../../services/wizardToText'
import { esportaDocx, scaricaDocx } from '../../services/exportDocx'
import { getTestTemplatesAttivi } from '../../data/testTemplatesData'
import { migraWizardSnapshotLegacy } from '../../services/testTemplateEngine'

function reducer(state, action) {
  switch (action.type) {
    case 'START':        return { ...state, status: 'generating', error: null }
    case 'DONE':         return { ...state, status: 'done', testo: action.testo }
    case 'ERROR':        return { ...state, status: 'error', error: action.error }
    case 'EDIT':         return { ...state, testo: action.testo }
    case 'EXPORTING':    return { ...state, exporting: true }
    case 'EXPORT_DONE':  return { ...state, exporting: false }
    case 'SAVING':        return { ...state, savingArchivio: true }
    case 'SAVED':         return { ...state, savingArchivio: false, saved: true }
    default: return state
  }
}

// wizardData può includere due campi opzionali "di contesto" quando si
    // riapre una relazione esistente dall'Archivio (vedi Archivio.tsx):
//   wizardData._relazioneId  → id della relazione da AGGIORNARE invece di duplicare
//   wizardData._pazienteId   → id del paziente già collegato, da aggiornare invece di ricreare
export default function RisultatoGenerazione() {
  const location = useLocation()
  const navigate = useNavigate()
  const wizardData = location.state?.wizardData ? migraWizardSnapshotLegacy(location.state.wizardData) : null
  const sourceRoute = wizardData?._sourceRoute || '/nuova'
  const breadcrumb = wizardData?._isDirectEdit
    ? 'Archivio > Modifica testo'
    : (sourceRoute.includes('/modifica')
      ? 'Archivio > Modifica relazione > Risultato'
      : (sourceRoute.includes('/bozza/riprendi')
        ? 'Bozze > Ripresa > Risultato'
        : 'Nuova relazione > Risultato'))

  const [state, dispatch] = useReducer(reducer, {
    status: 'generating', testo: '', error: null, exporting: false, saved: false, savingArchivio: false,
  })

  const isModifica = Boolean(wizardData?._relazioneId)

  // Guardia contro doppia esecuzione della generazione. Necessaria per due
  // motivi indipendenti:
  // 1) React.StrictMode (attivo in main.tsx) monta ogni componente due volte
  //    in sviluppo apposta per scovare effetti non idempotenti — normale,
  //    ma senza guardia genera due chiamate reali a Gemini per la stessa
  //    relazione, sprecando quota API (15 richieste/minuto nel tier gratuito).
  // 2) `wizardData` arriva da `location.state`, che può ricevere un nuovo
  //    riferimento oggetto a ogni render anche a contenuto invariato — questo
  //    rende `useCallback`/`useEffect` instabili anche fuori da StrictMode.
  // La guardia si basa sull'identità del wizardData "loggato" nella sessione
  // (via JSON.stringify su un sottoinsieme stabile), non sul riferimento
  // dell'oggetto, così una vera modifica dei dati fa ripartire la generazione
  // mentre un remount con dati identici no.
  const ultimaGenerazioneRef = useRef<string | null>(null)

  const run = useCallback(async () => {
    if (!wizardData) return
    dispatch({ type: 'START' })
    try {
      const profilo = await getProfiloStile()
      const esempi  = await getRelazioniSimilari(wizardData.tipo, [])
      // Template dei test dinamici (es. questionari custom come CBCL creati
      // in Gestione Test): senza questi, generaRelazione() non ha modo di
      // sapere quali campi/soglie corrispondono agli id in
      // wizardData.test_risultati, e la sezione corrispondente ricadrebbe
      // sul solo testo libero legacy — vedi la nota in geminiService.ts.
      const templates = await getTestTemplatesAttivi()
      const testoGrezzo = await generaRelazione(profilo || '', wizardData, esempi, templates)
      // Sostituisce {{NOME}} col nome reale — Gemini non lo ha mai visto,
      // il nome entra nel testo solo qui, lato client (vedi wizardToText.ts).
      const testo = sostituisciNomePlaceholder(testoGrezzo, wizardData.anagrafica)
      dispatch({ type: 'DONE', testo })
    } catch (e) {
      dispatch({ type: 'ERROR', error: e.message })
    }
  }, [wizardData])

  useEffect(() => {
    if (!wizardData) return
    if (wizardData._isDirectEdit) {
      if (ultimaGenerazioneRef.current === 'direct-edit') return
      ultimaGenerazioneRef.current = 'direct-edit'
      dispatch({ type: 'DONE', testo: location.state?.testoPreesistente || '' })
      return
    }
    const chiaveGenerazione = JSON.stringify({
      sezioni: wizardData.sezioni_attive,
      cognitivo: wizardData.cognitivo,
      nepsy: wizardData.nepsy,
      conclusioni: wizardData.conclusioni,
      relazioneId: wizardData._relazioneId,
    })
    if (ultimaGenerazioneRef.current === chiaveGenerazione) return
    ultimaGenerazioneRef.current = chiaveGenerazione
    run()
  }, [wizardData, run, location.state])

  if (!wizardData) {
    return <Navigate to="/nuova" replace />
  }

  // Salva (o aggiorna) sia l'anagrafica reale in `pazienti` sia il contenuto
  // clinico + snapshot del wizard in `relazioni`, collegati da paziente_id.
  // wizard_snapshot NON include mai `anagrafica` — vive solo in `pazienti`.
  async function handleSalvaArchivio() {
    dispatch({ type: 'SAVING' })

    const paziente = await upsertPazienteAnagrafica(wizardData.anagrafica, wizardData._pazienteId || null)

    const { anagrafica: _anagrafica, _relazioneId, _pazienteId, ...wizardSnapshot } = wizardData

    const payload = {
      titolo:         `Relazione — ${wizardData.anagrafica?.cognome || 'paziente'} — ${new Date().toLocaleDateString('it-IT')}`,
      tipo:           'generata',
      tipo_relazione: 'valutazione',
      anno:           new Date().getFullYear(),
      testo_markdown: state.testo,
      tag:            wizardData.sezioni_attive || [],
      paziente_id:    paziente?.id || null,
      wizard_snapshot: wizardSnapshot,
      updated_at:     new Date().toISOString(),
    }

    if (isModifica) {
      await updateRelazione(wizardData._relazioneId, payload)
    } else {
      await insertRelazione(payload)
    }

    dispatch({ type: 'SAVED' })
  }

  async function handleEsportaDocx() {
    dispatch({ type: 'EXPORTING' })
    try {
      const professionista = await getProfiloProfessionista()
      const templates = await getTestTemplatesAttivi()
      const blob    = await esportaDocx({
        testo: state.testo,
        anagrafica: wizardData.anagrafica,
        professionista,
        cognitivo: wizardData.cognitivo,
        nepsy: wizardData.nepsy,
        templates,
        testRisultati: wizardData.test_risultati,
      })
      const cognome = (wizardData.anagrafica?.cognome || 'paziente').replace(/\s+/g, '_')
      const oggi    = new Date().toISOString().slice(0, 10)
      scaricaDocx(blob, `relazione_${cognome}_${oggi}.docx`)
    } catch (e) {
      console.error('Errore export DOCX:', e)
      alert('Errore durante la generazione del DOCX: ' + e.message)
    } finally {
      dispatch({ type: 'EXPORT_DONE' })
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">
            {wizardData?._isDirectEdit 
              ? 'Modifica testo relazione' 
              : (isModifica ? 'Relazione aggiornata' : 'Relazione generata')}
          </div>
          <div className="topbar-sub">
            {wizardData?._isDirectEdit 
              ? 'Modifica direttamente il testo salvato ed esporta il DOCX' 
              : 'Revisiona e correggi prima di esportare'}
          </div>
          <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text-muted)' }}>{breadcrumb}</div>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate(sourceRoute)}>
          <RotateCcw size={14} /> {wizardData?._isDirectEdit ? 'Torna all\'archivio' : 'Torna al wizard'}
        </button>
      </div>

      <div className="page-body">
        {(USE_MOCK || USE_MOCK_AI) && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <FlaskConical size={15} style={{ flexShrink: 0 }} />
            <span>Generazione simulata — Gemini API non configurata. Il testo è un esempio strutturale, non clinicamente accurato.</span>
          </div>
        )}

        {state.status === 'generating' && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <span className="spinner" style={{ width: 28, height: 28, margin: '0 auto 14px', display: 'block' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>Generazione bozza in corso…</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="card" style={{ padding: 24 }}>
            <p style={{ color: 'var(--danger)', fontSize: 13.5, marginBottom: 12 }}>Errore: {state.error}</p>
            <button className="btn btn-secondary btn-sm" onClick={run}>
              <RefreshCw size={13} /> Riprova
            </button>
          </div>
        )}

        {state.status === 'done' && (
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              I dati anagrafici ({wizardData.anagrafica?.nome} {wizardData.anagrafica?.cognome}) non sono stati inviati a Gemini —
              vengono salvati separatamente e inseriti automaticamente solo nel DOCX esportato.
            </span>
          </div>
        )}

        {state.status === 'done' && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Bozza (editabile)</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleSalvaArchivio}
                  disabled={state.savingArchivio}
                >
                  {state.savingArchivio
                    ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Salvo…</>
                    : <><Save size={13} /> {state.saved ? (isModifica ? 'Aggiornata ✓ (salva di nuovo)' : 'Salvata ✓ (salva di nuovo)') : (isModifica ? 'Salva modifiche' : 'Salva in archivio')}</>}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleEsportaDocx}
                  disabled={state.exporting}
                >
                  {state.exporting
                    ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Generazione DOCX…</>
                    : <><FileDown size={13} /> Esporta DOCX</>}
                </button>
              </div>
            </div>

            <textarea
              className="form-textarea"
              value={state.testo}
              onChange={e => dispatch({ type: 'EDIT', testo: e.target.value })}
              style={{ minHeight: 520, fontFamily: 'var(--font-ui)', fontSize: 13.5, lineHeight: 1.8 }}
            />

            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
              Il testo sopra è in Markdown — i titoli (##), il <strong>grassetto</strong> e le tabelle (|) vengono convertiti automaticamente nel DOCX finale.
              {!wizardData?._isDirectEdit && isModifica && ' Puoi anche tornare al wizard per aggiungere sezioni (es. un test dimenticato) e rigenerare.'}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
