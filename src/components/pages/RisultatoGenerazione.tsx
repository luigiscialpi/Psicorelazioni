import { useReducer, useEffect, useCallback, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { FileDown, RotateCcw, Save, FlaskConical, RefreshCw, ShieldCheck } from 'lucide-react'
import { getProfiloStile, getProfiloProfessionista } from '../../data/profiloData'
import { getRelazioniSimilari, insertRelazione, updateRelazione } from '../../data/relazioniData'
import { upsertPazienteAnagrafica } from '../../data/pazientiData'
import { getSessioneById, upsertSessione, deleteSessione } from '../../data/sessioniData'
import { USE_MOCK } from '../../core/config'
import { generaRelazione, USE_MOCK_AI } from '../../services/geminiService'
import { sostituisciNomePlaceholder } from '../../services/wizardToText'
import { esportaDocx, scaricaDocx } from '../../services/exportDocx'
import { getTestTemplatesAttivi } from '../../data/testTemplatesData'
import { migraWizardSnapshotLegacy } from '../../services/testTemplateEngine'
import RichTextEditor from '../shared/RichTextEditor'

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
  const [searchParams] = useSearchParams()

  // ⚠️ SICUREZZA REFRESH: i dati per generare vivono SOLO in location.state
  // (stato di navigazione React Router). Un refresh del browser a volte lo
  // cancella (torna al wizard vuoto) e a volte no (il browser può
  // preservare history.state su un reload della stessa entry) — ma anche
  // quando sopravvive, la guardia contro le doppie generazioni no (è un
  // useRef, azzerato a ogni nuovo mount): il risultato è comunque una
  // SECONDA chiamata reale a Gemini con gli stessi dati, sprecando quota
  // e producendo un testo diverso dal primo (l'LLM non è deterministico).
  // Vale allo stesso modo per isModifica (relazione riaperta da Archivio):
  // l'id nell'URL (/risultato/:relazioneId) non basta da solo, perché
  // questo componente non lo rilegge mai con useParams().
  // Soluzione: appena la generazione riesce (vedi run()), il testo viene
  // salvato nella sessione wizard già autosalvata durante la compilazione
  // (wizardData._sessionId, popolato anche in modalità Modifica) e l'id
  // aggiunto all'URL come ?sessionId=. Se al mount successivo l'URL porta
  // ancora quell'id, il testo si rilegge da Supabase invece di rigenerare:
  // nessuna chiamata AI persa, nessuna doppia chiamata.
  const sessionIdInUrl = searchParams.get('sessionId')
  const wizardDataDaState = location.state?.wizardData ? migraWizardSnapshotLegacy(location.state.wizardData) : null

  // ⚠️ Il controllo su una bozza già generata per sessionIdInUrl deve
  // scattare SEMPRE che ci sia un sessionId nell'URL — non solo quando
  // wizardDataDaState manca. Un refresh non cancella affidabilmente
  // location.state (il browser può preservare history.state su un reload
  // della stessa entry): se il controllo scattasse solo in assenza di
  // location.state, nel caso — comune — in cui lo stato sopravvive
  // rimarrebbe silenziosamente inattivo e la doppia generazione non
  // verrebbe mai intercettata. Qui sessioneRecuperata.wizardData serve
  // solo come fallback per quando location.state manca davvero; se
  // wizardDataDaState è già presente, viene ignorato e si usa quello.
  const [sessioneRecuperata, setSessioneRecuperata] = useState<{ wizardData?: any; testo: string } | null>(null)
  const [recuperoInCorso, setRecuperoInCorso] = useState(Boolean(sessionIdInUrl))
  const recuperoTentatoRef = useRef(false)

  useEffect(() => {
    if (!sessionIdInUrl || recuperoTentatoRef.current) return
    recuperoTentatoRef.current = true
    getSessioneById(sessionIdInUrl)
      .then(sessione => {
        if (sessione) {
          setSessioneRecuperata({
            wizardData: sessione.risposte_wizard
              ? migraWizardSnapshotLegacy({ ...sessione.risposte_wizard, _sessionId: sessione.id })
              : undefined,
            testo: sessione.bozza_generata || '',
          })
        }
        // sessione non trovata: sessioneRecuperata resta null, wizardData
        // ricade su wizardDataDaState se presente, altrimenti redirect più sotto.
      })
      .catch(() => {})
      .finally(() => setRecuperoInCorso(false))
  }, [sessionIdInUrl])

  const wizardData = wizardDataDaState || sessioneRecuperata?.wizardData || null
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
  // mentre un remount con dati identici no. Non protegge da un remount VERO
  // (refresh): per quello vedi il recupero da sessionId sopra.
  const ultimaGenerazioneRef = useRef<string | null>(null)
  const editorRef = useRef<import('../shared/RichTextEditor').RichTextEditorHandle>(null)

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

      // Persistenza per sicurezza-refresh (vedi commento in cima al file).
      // ⚠️ Vale anche per isModifica: l'id di relazione nell'URL
      // (/risultato/:relazioneId) NON viene mai letto da useParams() in
      // questo file — è decorativo, esiste solo perché Archivio.tsx lo
      // costruisce nell'URL, ma non protegge da nulla. Un mount fresco
      // (refresh incluso) perde comunque la memoria "ho già generato
      // questo", perché quella memoria vive in un useRef, non nell'URL né
      // nel DB. Per questo la sessione wizard serve a ENTRAMBI i casi.
      try {
        const sessione = await upsertSessione(wizardData._sessionId || null, { bozza_generata: testo })
        if (sessione?.id && sessione.id !== sessionIdInUrl) {
          const basePath = wizardData._relazioneId ? `/risultato/${encodeURIComponent(wizardData._relazioneId)}` : '/risultato'
          navigate(`${basePath}?sessionId=${encodeURIComponent(String(sessione.id))}`, { replace: true, state: location.state })
        }
      } catch (e) {
        // Non bloccante: se il salvataggio della bozza fallisce, l'utente
        // ha comunque il testo appena generato a schermo e può salvarlo
        // in Archivio manualmente. Un refresh nel frattempo tornerebbe
        // però a rigenerare — rischio noto, preferibile a perdere la
        // generazione appena ottenuta per un errore di rete secondario.
        console.warn('[RisultatoGenerazione] Salvataggio automatico della bozza fallito:', e)
      }
    } catch (e) {
      dispatch({ type: 'ERROR', error: e.message })
    }
  }, [wizardData, sessionIdInUrl, navigate, location.state])

  useEffect(() => {
    if (!wizardData) return
    if (wizardData._isDirectEdit) {
      if (ultimaGenerazioneRef.current === 'direct-edit') return
      ultimaGenerazioneRef.current = 'direct-edit'
      dispatch({ type: 'DONE', testo: location.state?.testoPreesistente || '' })
      return
    }
    // Se l'URL porta un sessionId, aspetta l'esito del controllo su una
    // bozza già generata per QUESTI dati prima di decidere: altrimenti,
    // nella finestra in cui getSessioneById è ancora in volo, si arriva
    // comunque a run() prima che il controllo abbia la possibilità di
    // dire "aspetta, esiste già" — ed è esattamente lo scenario del
    // refresh quando location.state sopravvive (il caso più comune).
    if (sessionIdInUrl && recuperoInCorso) return
    // Bozza recuperata da sessionId con un testo già generato in precedenza:
    // mostralo direttamente, non richiamare Gemini per gli stessi dati.
    if (sessioneRecuperata?.testo) {
      if (ultimaGenerazioneRef.current === 'sessione-recuperata') return
      ultimaGenerazioneRef.current = 'sessione-recuperata'
      dispatch({ type: 'DONE', testo: sessioneRecuperata.testo })
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
  }, [wizardData, run, location.state, sessioneRecuperata, sessionIdInUrl, recuperoInCorso])

  if (!wizardData && recuperoInCorso) {
    return (
      <div className="page-body">
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <span className="spinner" style={{ width: 28, height: 28, margin: '0 auto 14px', display: 'block' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>Recupero della bozza…</p>
        </div>
      </div>
    )
  }

  if (!wizardData) {
    return <Navigate to="/nuova" replace />
  }

  // Salva (o aggiorna) sia l'anagrafica reale in `pazienti` sia il contenuto
  // clinico + snapshot del wizard in `relazioni`, collegati da paziente_id.
  // wizard_snapshot NON include mai `anagrafica` — vive solo in `pazienti`.
  async function handleSalvaArchivio() {
    const testoAggiornato = editorRef.current?.flush() ?? state.testo
    dispatch({ type: 'SAVING' })

    const paziente = await upsertPazienteAnagrafica(wizardData.anagrafica, wizardData._pazienteId || null)

    const { anagrafica: _anagrafica, _relazioneId, _pazienteId, _sessionId, ...wizardSnapshot } = wizardData

    const payload = {
      titolo:         `Relazione — ${wizardData.anagrafica?.cognome || 'paziente'} — ${new Date().toLocaleDateString('it-IT')}`,
      tipo:           'generata',
      tipo_relazione: 'valutazione',
      anno:           new Date().getFullYear(),
      testo_markdown: testoAggiornato,
      tag:            wizardData.sezioni_attive || [],
      paziente_id:    paziente?.id || null,
      wizard_snapshot: wizardSnapshot,
      updated_at:     new Date().toISOString(),
    }

    if (isModifica) {
      await updateRelazione(wizardData._relazioneId, payload)
    } else {
      await insertRelazione(payload)
      // La bozza autosalvata (per la sicurezza-refresh, vedi run()) ha
      // esaurito il suo scopo ora che la relazione è archiviata per bene:
      // senza questa pulizia resterebbe per sempre in "Bozze in corso" nel
      // Pannello, anche se in realtà è già stata salvata altrove.
      if (wizardData._sessionId) {
        deleteSessione(wizardData._sessionId).catch(() => {})
      }
    }

    dispatch({ type: 'SAVED' })
  }

  async function handleEsportaDocx() {
    const testoAggiornato = editorRef.current?.flush() ?? state.testo
    dispatch({ type: 'EXPORTING' })
    try {
      const professionista = await getProfiloProfessionista()
      const templates = await getTestTemplatesAttivi()
      const blob    = await esportaDocx({
        testo: testoAggiornato,
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

            <RichTextEditor
              ref={editorRef}
              value={state.testo}
              onChange={testo => dispatch({ type: 'EDIT', testo })}
              minHeight={520}
            />

            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
              In <strong>Visuale</strong> formatti col mouse (titoli, <strong>grassetto</strong>, <em>corsivo</em>, elenchi); in <strong>Testo</strong> vedi/modifichi il Markdown grezzo — è quello che viene convertito nel DOCX finale.
              {!wizardData?._isDirectEdit && isModifica && ' Puoi anche tornare al wizard per aggiungere sezioni (es. un test dimenticato) e rigenerare.'}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
