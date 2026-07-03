import { useReducer, useEffect, useRef, useState, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Save, FlaskConical, Check, ShieldAlert } from 'lucide-react'
import { getRelazioneById } from '../../data/relazioniData'
import { getPazienteById } from '../../data/pazientiData'
import { getSessioneById, upsertSessione } from '../../data/sessioniData'
import { USE_MOCK } from '../../core/config'
import type { UnknownRecord } from '../../core/types'
import {
  WISC_IV_CAMPI, NEPSY_II_DOMINI, fasciaWISC, fasciaScalare,
  WISC_IV_SUBTEST_PER_INDICE, WISC_IV_INDICE_LABEL,
} from '../constants/testDefinitions'
import {
  ANAMNESI_REMOTA_VOCI, ANAMNESI_RECENTE_VOCI,
  OSSERVAZIONE_ADATTAMENTO_VOCI, OSSERVAZIONE_ATTEGGIAMENTO_VOCI,
} from '../constants/anamnesiVoci'
import { getTestTemplatesAttivi } from '../../data/testTemplatesData'
import { calcolaFascia, getScalaApplicabile } from '../../services/testTemplateEngine'
import type { TestTemplate, RisultatoTest } from '../../core/testTemplate'

// ─────────────────────────────────────────────────────────────
// Wizard calibrato sulla struttura reale di relazioni di
// valutazione neuropsicologica/apprendimento.
//
// PRINCIPIO CHIAVE: i dati anagrafici REALI (nome, cognome, data
// di nascita) vengono raccolti qui ma NON fanno mai parte del
// payload mandato a Gemini — restano lato client e vengono
// ricomposti nel documento finale solo in fase di export DOCX
// (vedi RisultatoGenerazione.tsx + exportDocx.ts). Gemini vede
// sempre e solo "il/la paziente", mai un nome reale.
//
// I punteggi dei test (WISC-IV, NEPSY-II) sono input numerici
// guidati per singolo indice/subtest — la tabella Word e le fasce
// interpretative ("Media", "Superiore"...) sono calcolate in
// automatico, non richiedono che tua sorella le scriva a mano.
// ─────────────────────────────────────────────────────────────

// ── Sezioni non-test (invariate) ─────────────────────────────
const SEZIONI_NON_TEST = [
  { id: 'anamnesi',      label: 'Anamnesi (remota e recente)',         default: true,  isTest: false },
  { id: 'osservazione',  label: 'Osservazione comportamentale',         default: true,  isTest: false },
  { id: 'apprendimenti', label: 'Valutazione apprendimenti (lettura/scrittura/matematica)', default: false, isTest: false },
  { id: 'questionari',   label: 'Questionari (CBCL/YSR/Conners...)',    default: false, isTest: false },
  { id: 'conclusioni',   label: 'Conclusioni e diagnosi',               default: true,  isTest: false },
]

// SEZIONI_DISPONIBILI sarà costruita dinamicamente in WizardNuovaRelazione
// combinando SEZIONI_NON_TEST + template attivi da testTemplatesData.
// Per i componenti che ne hanno bisogno al di fuori del componente principale,
// si usa SEZIONI_NON_TEST o si passa la lista come prop.

const TIPI_INVIO = ['neuropsichiatra infantile', 'scuola', 'famiglia (privato)', 'altro specialista', 'altro']

const INIT = {
  // sezioni_attive contiene ID sia di sezioni non-test sia di template (es. 'wisc-iv', 'nepsy-ii')
  sezioni_attive: [...SEZIONI_NON_TEST.filter(s => s.default).map(s => s.id), 'wisc-iv'],

  // ⚠️ ANAGRAFICA REALE — non va mai a Gemini, solo nel DOCX finale
  anagrafica: { nome: '', cognome: '', data_nascita: '', scuola_classe: '' },

  // Contesto invio — questo invece può andare a Gemini (nessun dato identificativo)
  motivo_invio: '', tipo_invio: '', nome_inviante: '',
  paziente_nuovo: true, codice_paziente: '',

  anamnesi:      { remota_voci: [], remota_dettagli: {}, remota_extra: '', recente_voci: [], recente_dettagli: {}, recente_extra: '' },
  osservazione:  { adattamento_voci: [], atteggiamento_voci: [], note: '' },
  // Legacy fields mantenuti per retrocompatibilità e per il path di export che li legge ancora
  cognitivo:     {
    somministrato: true, punteggi: {}, interpretabilita: {},
    subtest_pp: {}, eta_valutazione: '', strumenti_utilizzati: '',
    includi_nota_range: true, note_cliniche: '',
  },
  nepsy:         { somministrato: true, punteggi: {}, strumenti_utilizzati: '', includi_nota_range: true, note_cliniche: '' },
  // test_risultati: nuovo formato dinamico per template generici
  test_risultati: {} as Record<string, RisultatoTest>,
  apprendimenti: { strumenti: '', punteggi_grezzi: '', lettura: '', scrittura: '', matematica: '' },
  questionari:   { tipo: '', punteggi_grezzi: '', note_cliniche: '' },
  conclusioni:   { diagnosi: '', codice_icd: '', consigli_paziente: '', consigli_scuola: '', strumenti_compensativi: '', misure_dispensative: '' },

  destinatario_finale: 'famiglia', lunghezza: 'standard', note_extra: '',
}

// ── Reducer ─────────────────────────────────────────────────
function wizardReducer(state, action) {
  switch (action.type) {
    case 'HYDRATE': // usato per pre-popolare il wizard con dati esistenti (riapertura da Archivio)
      return { ...state, ...action.payload }
    case 'SET':
      return action.section
        ? { ...state, [action.section]: { ...state[action.section], [action.k]: action.v } }
        : { ...state, [action.k]: action.v }
    case 'SET_NESTED': // per punteggi.wisc.icv = 102 ecc.
      return { ...state, [action.section]: { ...state[action.section],
        [action.group]: { ...state[action.section][action.group], [action.k]: action.v } } }
    // Nuovo: aggiorna un campo dentro test_risultati[templateId]
    case 'SET_TEST_RISULTATO': {
      const prevRis = state.test_risultati?.[action.templateId] || { somministrato: true, punteggi: {} }
      const prevGroup = prevRis[action.group] || {}
      return {
        ...state,
        test_risultati: {
          ...(state.test_risultati || {}),
          [action.templateId]: {
            ...prevRis,
            [action.group]: action.k
              ? { ...prevGroup, [action.k]: action.v }
              : action.v,
          },
        },
      }
    }
    case 'TOGGLE_SEZIONE': {
      const attive = state.sezioni_attive.includes(action.id)
        ? state.sezioni_attive.filter(s => s !== action.id)
        : [...state.sezioni_attive, action.id]
      return { ...state, sezioni_attive: attive }
    }
    case 'TOGGLE_VOCE': { // per anamnesi/osservazione checkbox
      const arr = state[action.section][action.field]
      const nuovoArr = arr.includes(action.id) ? arr.filter(x => x !== action.id) : [...arr, action.id]
      return { ...state, [action.section]: { ...state[action.section], [action.field]: nuovoArr } }
    }
    case 'SET_DETTAGLIO': {
      const dettagli = { ...state[action.section][action.field], [action.id]: action.testo }
      return { ...state, [action.section]: { ...state[action.section], [action.field]: dettagli } }
    }
    default: return state
  }
}

const sh    = { fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 600, marginBottom: 6, color: 'var(--accent-dk)' }
const shSub = { fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }

// ── Validazione per step ────────────────────────────────────
function validateStep(stepId, data, templates: TestTemplate[] = []) {
  const mancanti: string[] = []

  switch (stepId) {
    case 'sezioni':
      if (!data.sezioni_attive || data.sezioni_attive.length === 0) mancanti.push('Almeno una sezione')
      break

    case 'anagrafica':
      if (!data.anagrafica?.nome?.trim()) mancanti.push('Nome')
      if (!data.anagrafica?.cognome?.trim()) mancanti.push('Cognome')
      if (!data.anagrafica?.data_nascita?.trim()) mancanti.push('Data di nascita')
      break

    case 'contesto':
      if (!String(data.motivo_invio || '').trim()) mancanti.push('Motivo dell\'invio')
      break

    case 'cognitivo': {
      // Retrocompatibilità con sessioni legacy che usano ancora wizard.cognitivo
      const punteggi = data.cognitivo?.punteggi || data.test_risultati?.['wisc-iv']?.punteggi || {}
      const almenoUno = Object.values(punteggi).some(v => String(v ?? '').trim() !== '')
      if (!almenoUno) mancanti.push('Almeno un punteggio WISC-IV (o deseleziona la sezione)')
      break
    }

    case 'nepsy': {
      // Retrocompatibilità
      const punteggi = data.nepsy?.punteggi || data.test_risultati?.['nepsy-ii']?.punteggi || {}
      const almenoUno = Object.values(punteggi).some(v => String(v ?? '').trim() !== '')
      if (!almenoUno) mancanti.push('Almeno un punteggio NEPSY-II (o deseleziona la sezione)')
      break
    }

    case 'conclusioni':
      if (!String(data.conclusioni?.diagnosi || '').trim()) mancanti.push('Diagnosi')
      break

    default: {
      // Caso generico: cerca tra i template attivi
      const template = templates.find(t => t.id === stepId)
      if (template) {
        const risultato = data.test_risultati?.[stepId]
        const punteggi = risultato?.punteggi || {}
        const almenoUno = Object.values(punteggi).some(v => String(v ?? '').trim() !== '')
        if (!almenoUno) mancanti.push(`Almeno un punteggio ${template.nome} (o deseleziona la sezione)`)
      }
      break
    }
  }

  return mancanti
}

// ── Checkbox riutilizzabile con dettaglio opzionale ────────
function VoceCheckbox({ voce, checked, onToggle, dettaglio, onDettaglio }: any) {
  return (
    <div style={{ marginBottom: 8 }}>
      <button type="button" onClick={onToggle} style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%', textAlign: 'left',
        padding: '9px 12px', borderRadius: 'var(--radius)', cursor: 'pointer',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-md)'}`,
        background: checked ? 'var(--accent-lt)' : 'var(--bg-panel)', transition: 'all .15s',
      }}>
        <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
          border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-md)'}`,
          background: checked ? 'var(--accent)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {checked && <Check size={10} color="#fff" strokeWidth={3} />}
        </div>
        <span style={{ fontSize: 13, color: checked ? 'var(--accent-dk)' : 'var(--text)' }}>{voce.testo}</span>
      </button>
      {checked && voce.richiedeDettaglio && (
        <input
          className="form-input" style={{ marginTop: 6, marginLeft: 24, width: 'calc(100% - 24px)', fontSize: 12.5 }}
          placeholder={voce.placeholder}
          value={dettaglio || ''}
          onChange={e => onDettaglio?.(e.target.value)}
        />
      )}
    </div>
  )
}

// ── Step 0 — Selezione sezioni ─────────────────────────────
function StepSezioni({ data, dispatch, templates }: { data: any, dispatch: any, templates: TestTemplate[] }) {
  // Costruisce la lista completa: sezioni non-test + template attivi
  // Le sezioni non-test si inseriscono in posizioni fisse (prima i test, poi le altre)
  const sezioniTest = templates.map(t => ({ id: t.id, label: t.nome, default: t.builtIn, isTest: true, badge: t.categoria }))
  
  // Ordine: anamnesi, osservazione, [test...], apprendimenti, questionari, conclusioni
  const sezioniDisponibili = [
    SEZIONI_NON_TEST[0], // anamnesi
    SEZIONI_NON_TEST[1], // osservazione
    ...sezioniTest,
    SEZIONI_NON_TEST[2], // apprendimenti
    SEZIONI_NON_TEST[3], // questionari
    SEZIONI_NON_TEST[4], // conclusioni
  ]

  return (
    <div>
      <h3 style={sh}>Quali sezioni includere?</h3>
      <p style={shSub}>Seleziona solo le valutazioni effettivamente svolte per questo caso.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sezioniDisponibili.map(s => {
          const attiva = data.sezioni_attive.includes(s.id)
          const isTest = 'isTest' in s && s.isTest
          return (
            <button key={s.id} type="button" onClick={() => dispatch({ type: 'TOGGLE_SEZIONE', id: s.id })} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 'var(--radius)',
              border: `1px solid ${attiva ? 'var(--accent)' : 'var(--border-md)'}`,
              background: attiva ? 'var(--accent-lt)' : 'var(--bg-panel)', cursor: 'pointer', textAlign: 'left', width: '100%',
            }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: `1.5px solid ${attiva ? 'var(--accent)' : 'var(--border-md)'}`,
                background: attiva ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {attiva && <Check size={12} color="#fff" strokeWidth={3} />}
              </div>
              <span style={{ fontSize: 13.5, color: attiva ? 'var(--accent-dk)' : 'var(--text)', fontWeight: attiva ? 500 : 400, flex: 1 }}>{s.label}</span>
              {isTest && (
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 12, padding: '1px 7px' }}>
                  {'badge' in s ? s.badge : 'test'}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 1 — Anagrafica REALE (mai mandata a Gemini) ───────
function StepAnagrafica({ data, set }) {
  return (
    <div>
      <h3 style={sh}>Dati anagrafici</h3>
      <div className="alert alert-info" style={{ marginBottom: 18 }}>
        <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Questi dati restano sul tuo dispositivo e compaiono <strong>solo nel documento finale</strong>: non vengono mai inviati a Gemini per la generazione del testo.</span>
      </div>

      <div className="meta-row">
        <div className="form-group">
          <label className="form-label">Nome *</label>
          <input className="form-input" value={data.nome} onChange={e => set('nome', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Cognome *</label>
          <input className="form-input" value={data.cognome} onChange={e => set('cognome', e.target.value)} />
        </div>
      </div>
      <div className="meta-row">
        <div className="form-group">
          <label className="form-label">Data di nascita *</label>
          <input className="form-input" type="date" value={data.data_nascita} onChange={e => set('data_nascita', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Scuola / classe <span>(facoltativo)</span></label>
          <input className="form-input" placeholder="es. 1° Liceo Linguistico" value={data.scuola_classe} onChange={e => set('scuola_classe', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

// ── Step 2 — Contesto invio (senza dati identificativi) ────
function StepContesto({ data, set }) {
  return (
    <div>
      <h3 style={sh}>Contesto dell'invio</h3>
      <p style={shSub}>Motivo e tipo di invio vengono elaborati dall'AI e non sono identificativi del/la paziente. Il nome di chi invia (se lo indichi) viene invece riportato per esteso nella relazione, come nei referti reali.</p>

      <div className="form-group">
        <label className="form-label">Riferimento interno <span>(facoltativo, per ritrovare il caso in archivio)</span></label>
        <input className="form-input" placeholder="es. codice fascicolo interno" value={data.codice_paziente} onChange={e => set('codice_paziente', e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">Motivo dell'invio *</label>
        <textarea className="form-textarea" rows={2} placeholder="es. rivalutazione per rinnovo PDP…" value={data.motivo_invio} onChange={e => set('motivo_invio', e.target.value)} />
      </div>

      <div className="meta-row">
        <div className="form-group">
          <label className="form-label">Chi invia</label>
          <select className="form-select" value={data.tipo_invio} onChange={e => set('tipo_invio', e.target.value)}>
            <option value="">— seleziona —</option>
            {TIPI_INVIO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Nome inviante <span>(facoltativo)</span></label>
          <input className="form-input" value={data.nome_inviante} onChange={e => set('nome_inviante', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

// ── Step Anamnesi — checkbox + dettaglio + extra libero ────
function StepAnamnesi({ data, dispatch }) {
  return (
    <div>
      <h3 style={sh}>Anamnesi remota</h3>
      <p style={shSub}>Seleziona le voci pertinenti — aggiungi dettagli dove richiesto.</p>
      {ANAMNESI_REMOTA_VOCI.map(v => (
        <VoceCheckbox key={v.id} voce={v}
          checked={data.remota_voci.includes(v.id)}
          onToggle={() => dispatch({ type: 'TOGGLE_VOCE', section: 'anamnesi', field: 'remota_voci', id: v.id })}
          dettaglio={data.remota_dettagli[v.id]}
          onDettaglio={testo => dispatch({ type: 'SET_DETTAGLIO', section: 'anamnesi', field: 'remota_dettagli', id: v.id, testo })}
        />
      ))}
      <div className="form-group" style={{ marginTop: 14 }}>
        <label className="form-label">Altro <span>(facoltativo)</span></label>
        <textarea className="form-textarea" rows={2} value={data.remota_extra}
          onChange={e => dispatch({ type: 'SET', section: 'anamnesi', k: 'remota_extra', v: e.target.value })} />
      </div>

      <h3 style={{ ...sh, marginTop: 28 }}>Anamnesi recente</h3>
      <p style={shSub}>Situazione scolastica e familiare attuale.</p>
      {ANAMNESI_RECENTE_VOCI.map(v => (
        <VoceCheckbox key={v.id} voce={v}
          checked={data.recente_voci.includes(v.id)}
          onToggle={() => dispatch({ type: 'TOGGLE_VOCE', section: 'anamnesi', field: 'recente_voci', id: v.id })}
          dettaglio={data.recente_dettagli[v.id]}
          onDettaglio={testo => dispatch({ type: 'SET_DETTAGLIO', section: 'anamnesi', field: 'recente_dettagli', id: v.id, testo })}
        />
      ))}
      <div className="form-group" style={{ marginTop: 14 }}>
        <label className="form-label">Altro <span>(facoltativo)</span></label>
        <textarea className="form-textarea" rows={2} value={data.recente_extra}
          onChange={e => dispatch({ type: 'SET', section: 'anamnesi', k: 'recente_extra', v: e.target.value })} />
      </div>
    </div>
  )
}

// ── Step Osservazione — checkbox ────────────────────────────
function StepOsservazione({ data, dispatch }) {
  return (
    <div>
      <h3 style={sh}>Osservazione comportamentale</h3>
      <p style={shSub}>Adattamento al setting.</p>
      {OSSERVAZIONE_ADATTAMENTO_VOCI.map(v => (
        <VoceCheckbox key={v.id} voce={v}
          checked={data.adattamento_voci.includes(v.id)}
          onToggle={() => dispatch({ type: 'TOGGLE_VOCE', section: 'osservazione', field: 'adattamento_voci', id: v.id })}
        />
      ))}

      <h3 style={{ ...sh, marginTop: 24 }}>Atteggiamento e collaborazione</h3>
      {OSSERVAZIONE_ATTEGGIAMENTO_VOCI.map(v => (
        <VoceCheckbox key={v.id} voce={v}
          checked={data.atteggiamento_voci.includes(v.id)}
          onToggle={() => dispatch({ type: 'TOGGLE_VOCE', section: 'osservazione', field: 'atteggiamento_voci', id: v.id })}
        />
      ))}

      <div className="form-group" style={{ marginTop: 14 }}>
        <label className="form-label">Altre osservazioni <span>(facoltativo)</span></label>
        <textarea className="form-textarea" rows={2} value={data.note}
          onChange={e => dispatch({ type: 'SET', section: 'osservazione', k: 'note', v: e.target.value })} />
      </div>
    </div>
  )
}

// ── Step Cognitivo — input numerici guidati WISC-IV ─────────
// ── Step Test Generico — rimpiazza StepCognitivo e StepNepsy ─
// Questo componente si auto-adatta a qualsiasi TestTemplate.
// Per WISC-IV e NEPSY-II usa ancora wizard.cognitivo / wizard.nepsy
// per retrocompatibilità con le sessioni esistenti.
function StepTestGenerico({ template, data, dispatch }: { template: TestTemplate, data: any, dispatch: any }) {
  // Retrocompatibilità: WISC-IV e NEPSY-II leggono ancora dal vecchio formato
  const isWisc = template.id === 'wisc-iv'
  const isNepsy = template.id === 'nepsy-ii'
  const legacySection = isWisc ? 'cognitivo' : isNepsy ? 'nepsy' : null

  // Legge i dati dalla sezione legacy O da test_risultati
  const risultato: RisultatoTest = legacySection
    ? {
        somministrato: data[legacySection]?.somministrato ?? true,
        punteggi: data[legacySection]?.punteggi || {},
        punteggiSecondari: data[legacySection]?.subtest_pp || {},
        interpretabilita: data[legacySection]?.interpretabilita || {},
        includiNotaRange: data[legacySection]?.includi_nota_range ?? true,
        etaValutazione: data[legacySection]?.eta_valutazione || '',
        strumentiUtilizzati: data[legacySection]?.strumenti_utilizzati || '',
        noteCliniche: data[legacySection]?.note_cliniche || '',
      }
    : (data.test_risultati?.[template.id] || { somministrato: true, punteggi: {} })

  // Helper per dispatch verso la sezione corretta
  function setPunteggio(key: string, v: string) {
    if (legacySection) {
      dispatch({ type: 'SET_NESTED', section: legacySection, group: 'punteggi', k: key, v })
    } else {
      dispatch({ type: 'SET_TEST_RISULTATO', templateId: template.id, group: 'punteggi', k: key, v })
    }
  }
  function setSubtest(key: string, v: string) {
    if (legacySection === 'cognitivo') {
      dispatch({ type: 'SET_NESTED', section: 'cognitivo', group: 'subtest_pp', k: key, v })
    } else if (!legacySection) {
      dispatch({ type: 'SET_TEST_RISULTATO', templateId: template.id, group: 'punteggiSecondari', k: key, v })
    }
  }
  function setInterp(key: string, v: boolean) {
    if (legacySection === 'cognitivo') {
      dispatch({ type: 'SET_NESTED', section: 'cognitivo', group: 'interpretabilita', k: key, v })
    } else if (!legacySection) {
      dispatch({ type: 'SET_TEST_RISULTATO', templateId: template.id, group: 'interpretabilita', k: key, v })
    }
  }
  function setField(k: string, v: any) {
    if (legacySection) {
      const legacyKey = k === 'includiNotaRange' ? 'includi_nota_range'
        : k === 'etaValutazione' ? 'eta_valutazione'
        : k === 'strumentiUtilizzati' ? 'strumenti_utilizzati'
        : k === 'noteCliniche' ? 'note_cliniche' : k
      dispatch({ type: 'SET', section: legacySection, k: legacyKey, v })
    } else {
      dispatch({ type: 'SET_TEST_RISULTATO', templateId: template.id, group: k, k: null, v })
    }
  }

  const categoriaLabel = template.categoria === 'cognitivo'
    ? 'Valutazione cognitiva'
    : template.categoria === 'nepsy'
    ? 'Approfondimento neuropsicologico'
    : 'Test neuropsicologico'

  const haInterpretabilita = template.campiPrincipali.some(c => c.scala?.tipo === 'qi_wisc' || template.scalaDefault.tipo === 'qi_wisc')

  return (
    <div>
      <h3 style={sh}>{categoriaLabel} — {template.nome}</h3>
      <p style={shSub}>
        Inserisci i punteggi per ciascun campo. Fascia interpretativa calcolata automaticamente.{' '}
        <strong>Almeno un punteggio è richiesto</strong> per proseguire.
      </p>

      {/* Età e strumenti (se il template li richiede) */}
      {(template.richiedeEtaValutazione || template.richiedeStrumentiUtilizzati) && (
        <div className="meta-row" style={{ marginBottom: 10 }}>
          {template.richiedeEtaValutazione && (
            <div className="form-group">
              <label className="form-label">Età al momento della valutazione <span>(facoltativo)</span></label>
              <input
                className="form-input"
                placeholder="es. 10 anni e 4 mesi"
                value={risultato.etaValutazione || ''}
                onChange={e => setField('etaValutazione', e.target.value)}
              />
            </div>
          )}
          {template.richiedeStrumentiUtilizzati && (
            <div className="form-group">
              <label className="form-label">Strumenti utilizzati <span>(facoltativo)</span></label>
              <input
                className="form-input"
                placeholder={`es. ${template.nome}`}
                value={risultato.strumentiUtilizzati || ''}
                onChange={e => setField('strumentiUtilizzati', e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* Campi principali (indici/scale principali) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {template.campiPrincipali.map(campo => {
          const scala = getScalaApplicabile(campo, template)
          const val = risultato.punteggi[campo.key] || ''
          const fascia = val ? (calcolaFascia(val, scala) || '—') : '—'
          const interpretabile = risultato.interpretabilita?.[campo.key] !== false
          return (
            <div key={campo.key} style={{
              display: 'grid',
              gridTemplateColumns: haInterpretabilita ? '1fr 90px 140px 30px' : '1fr 90px 140px',
              gap: 10, alignItems: 'center',
              padding: '8px 10px', borderRadius: 'var(--radius)',
              background: 'transparent',
            }}>
              <span style={{ fontSize: 12.5 }}>{campo.label}</span>
              <input
                className="form-input" type="number" placeholder="—"
                value={val}
                onChange={e => setPunteggio(campo.key, e.target.value)}
                style={{ textAlign: 'center', padding: '6px 8px' }}
              />
              <span style={{ fontSize: 11.5, color: fascia !== '—' ? 'var(--accent-dk)' : 'var(--text-muted)', fontWeight: fascia !== '—' ? 500 : 400 }}>
                {fascia}
              </span>
              {haInterpretabilita && (
                <label title="Interpretabile (Sì/No)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={interpretabile}
                    onChange={e => setInterp(campo.key, e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>
      {haInterpretabilita && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          L'ultima colonna segnala se l'indice è interpretabile. La colonna "Interpretabilità" apparirà nella tabella finale solo se almeno un indice è deselezionato.
        </p>
      )}

      {/* Gruppi secondari (subtest) — accordion */}
      {template.gruppiSecondari && template.gruppiSecondari.length > 0 && (
        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label">Subtest per indice <span>(facoltativo)</span></label>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 10 }}>
            Compila solo i subtest somministrati: nella relazione verranno spiegati a parole, mai in tabella.
          </p>
          {template.gruppiSecondari.map(gruppo => {
            const nCompilati = gruppo.campi.filter(c =>
              risultato.punteggiSecondari?.[c.key] !== undefined && risultato.punteggiSecondari[c.key] !== ''
            ).length
            return (
              <details key={gruppo.key} style={{ marginBottom: 8, border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '2px 12px' }}>
                <summary style={{ cursor: 'pointer', padding: '8px 0', fontSize: 13, fontWeight: 500, color: 'var(--accent-dk)', listStyle: 'none' }}>
                  {gruppo.label} {nCompilati > 0 && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11.5 }}>· {nCompilati} compilat{nCompilati === 1 ? 'o' : 'i'}</span>}
                </summary>
                <div style={{ paddingBottom: 10 }}>
                  {gruppo.campi.map(campo => {
                    const scalaGruppo = campo.scala || gruppo.scalaDefault || template.scalaDefault
                    const val = risultato.punteggiSecondari?.[campo.key] || ''
                    const fascia = val ? (calcolaFascia(val, scalaGruppo) || '—') : '—'
                    return (
                      <div key={campo.key} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 140px', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5 }}>{campo.label}</span>
                        <input
                          className="form-input" type="number" placeholder="pp"
                          value={val}
                          onChange={e => setSubtest(campo.key, e.target.value)}
                          style={{ textAlign: 'center', padding: '6px 8px' }}
                        />
                        <span style={{ fontSize: 11.5, color: fascia !== '—' ? 'var(--accent-dk)' : 'var(--text-muted)', fontWeight: fascia !== '—' ? 500 : 400 }}>
                          {fascia}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </details>
            )
          })}
        </div>
      )}

      {/* Nota range */}
      {template.notaRange && (
        <div className="form-group" style={{ marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <input
              type="checkbox"
              checked={risultato.includiNotaRange !== false}
              onChange={e => setField('includiNotaRange', e.target.checked)}
            />
            Includi nota standard sui range {template.nome}
          </label>
        </div>
      )}

      {/* Note cliniche */}
      <div className="form-group" style={{ marginTop: 18 }}>
        <label className="form-label">Note cliniche aggiuntive <span>(facoltativo)</span></label>
        <textarea className="form-textarea" rows={3} placeholder="Osservazioni durante la somministrazione…"
          value={risultato.noteCliniche || ''}
          onChange={e => setField('noteCliniche', e.target.value)}
        />
      </div>
    </div>
  )
}

// ── Step Apprendimenti — resta testo libero (test troppo eterogenei) ─
function StepApprendimenti({ data, set }) {
  return (
    <div>
      <h3 style={sh}>Valutazione apprendimenti</h3>
      <p style={shSub}>Lettura, scrittura, matematica — strumenti eterogenei (Prove MT, BVSCO, AC-MT...), inserisci i punteggi come testo libero.</p>
      <div className="form-group">
        <label className="form-label">Strumenti utilizzati</label>
        <input className="form-input" placeholder="es. Nuove MT, BVSCO 3, AC-MT…" value={data.strumenti} onChange={e => set('strumenti', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Punteggi</label>
        <textarea className="form-textarea" rows={6} placeholder="es. Lettura brano (rapidità): -1.8 DS…"
          value={data.punteggi_grezzi} onChange={e => set('punteggi_grezzi', e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
      </div>
      <div className="meta-row">
        <div className="form-group"><label className="form-label">Note su lettura</label><textarea className="form-textarea" rows={2} value={data.lettura} onChange={e => set('lettura', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Note su scrittura</label><textarea className="form-textarea" rows={2} value={data.scrittura} onChange={e => set('scrittura', e.target.value)} /></div>
      </div>
      <div className="form-group"><label className="form-label">Note su matematica</label><textarea className="form-textarea" rows={2} value={data.matematica} onChange={e => set('matematica', e.target.value)} /></div>
    </div>
  )
}

// ── Step Questionari — resta testo libero ───────────────────
function StepQuestionari({ data, set }) {
  return (
    <div>
      <h3 style={sh}>Questionari</h3>
      <p style={shSub}>CBCL/YSR, Conners — scale eterogenee, inserisci i punteggi come testo libero.</p>
      <div className="form-group">
        <label className="form-label">Questionari somministrati</label>
        <input className="form-input" placeholder="es. CBCL ai genitori, YSR al ragazzo…" value={data.tipo} onChange={e => set('tipo', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Punteggi</label>
        <textarea className="form-textarea" rows={6} value={data.punteggi_grezzi} onChange={e => set('punteggi_grezzi', e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
      </div>
      <div className="form-group"><label className="form-label">Note interpretative</label><textarea className="form-textarea" rows={3} value={data.note_cliniche} onChange={e => set('note_cliniche', e.target.value)} /></div>
    </div>
  )
}

// ── Step Conclusioni ─────────────────────────────────────────
function StepConclusioni({ data, set }) {
  return (
    <div>
      <h3 style={sh}>Conclusioni e diagnosi</h3>
      <div className="meta-row">
        <div className="form-group"><label className="form-label">Diagnosi *</label><input className="form-input" value={data.diagnosi} onChange={e => set('diagnosi', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Codice ICD <span>(facoltativo)</span></label><input className="form-input" value={data.codice_icd} onChange={e => set('codice_icd', e.target.value)} /></div>
      </div>
      <div className="form-group"><label className="form-label">Consigli al paziente / famiglia <span>(facoltativo)</span></label><textarea className="form-textarea" rows={3} value={data.consigli_paziente} onChange={e => set('consigli_paziente', e.target.value)} /></div>
      <div className="form-group"><label className="form-label">Consigli alla scuola <span>(facoltativo)</span></label><textarea className="form-textarea" rows={3} value={data.consigli_scuola} onChange={e => set('consigli_scuola', e.target.value)} /></div>
      <div className="meta-row">
        <div className="form-group"><label className="form-label">Strumenti compensativi <span>(facoltativo)</span></label><textarea className="form-textarea" rows={3} value={data.strumenti_compensativi} onChange={e => set('strumenti_compensativi', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Misure dispensative <span>(facoltativo)</span></label><textarea className="form-textarea" rows={3} value={data.misure_dispensative} onChange={e => set('misure_dispensative', e.target.value)} /></div>
      </div>
    </div>
  )
}

// ── Step finale ───────────────────────────────────────────
function StepFinale({ data, set }) {
  return (
    <div>
      <h3 style={sh}>Ultimi dettagli</h3>
      <div className="form-group">
        <label className="form-label">Destinatario della copia</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {['famiglia', 'scuola', 'entrambi'].map(d => (
            <button key={d} type="button" className={`btn ${data.destinatario_finale === d ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => set('destinatario_finale', d)}>{d}</button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Lunghezza indicativa</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {['sintetica', 'standard', 'dettagliata'].map(l => (
            <button key={l} type="button" className={`btn ${data.lunghezza === l ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => set('lunghezza', l)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Note aggiuntive <span>(facoltativo)</span></label>
        <textarea className="form-textarea" rows={3} value={data.note_extra} onChange={e => set('note_extra', e.target.value)} />
      </div>
    </div>
  )
}

// ── Costruzione dinamica degli step ────────────────────────
function buildSteps(sezioniAttive, templates: TestTemplate[] = []) {
  const steps = [
    { id: 'sezioni',    label: 'Sezioni',     section: null,     render: (d, dp) => <StepSezioni data={d} dispatch={dp} templates={templates} /> },
    { id: 'anagrafica', label: 'Anagrafica',  section: 'anagrafica', render: (d, dp, set) => <StepAnagrafica data={d} set={set} /> },
    { id: 'contesto',   label: 'Contesto',    section: null,     render: (d, dp, set) => <StepContesto data={d} set={set} /> },
  ]

  if (sezioniAttive.includes('anamnesi'))
    steps.push({ id: 'anamnesi', label: 'Anamnesi', section: 'anamnesi', render: (d, dp) => <StepAnamnesi data={d} dispatch={dp} /> })

  if (sezioniAttive.includes('osservazione'))
    steps.push({ id: 'osservazione', label: 'Osservazione', section: 'osservazione', render: (d, dp) => <StepOsservazione data={d} dispatch={dp} /> })

  // Template attivi nell'ordine in cui compaiono in sezioniAttive
  for (const templateId of sezioniAttive) {
    const template = templates.find(t => t.id === templateId)
    if (template) {
      steps.push({
        id: template.id,
        label: template.nome,
        section: null, // dati letti internamente da StepTestGenerico
        render: (d, dp) => <StepTestGenerico template={template} data={d} dispatch={dp} />
      })
    }
  }

  if (sezioniAttive.includes('apprendimenti'))
    steps.push({ id: 'apprendimenti', label: 'Apprendimenti', section: 'apprendimenti', render: (d, dp, set) => <StepApprendimenti data={d} set={set} /> })

  if (sezioniAttive.includes('questionari'))
    steps.push({ id: 'questionari', label: 'Questionari', section: 'questionari', render: (d, dp, set) => <StepQuestionari data={d} set={set} /> })

  if (sezioniAttive.includes('conclusioni'))
    steps.push({ id: 'conclusioni', label: 'Conclusioni', section: 'conclusioni', render: (d, dp, set) => <StepConclusioni data={d} set={set} /> })

  steps.push({ id: 'finale', label: 'Dettagli finali', section: null, render: (d, dp, set) => <StepFinale data={d} set={set} /> })

  return steps
}


export default function WizardNuovaRelazione() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isBozzaRoute = location.pathname === '/bozza/riprendi'
  const isModificaRoute = location.pathname === '/modifica'
  const [data, dispatch] = useReducer(wizardReducer, INIT)
  const [step, dispatchStep] = useReducer((s, a) => a.type === 'NEXT' ? s + 1 : a.type === 'PREV' ? Math.max(0, s - 1) : a.value, 0)
  const [hydrating, setHydrating] = useReducer((_s, a) => Boolean(a), true)
  const sessionIdRef = useRef(null)
  const [saving, toggleSaving] = useReducer(s => !s, false)
  const saveTimer = useRef(null)
  const [validationError, setValidationError] = useState('')
  const [templates, setTemplates] = useState<TestTemplate[]>([])
  // Step già visitati almeno una volta — serve per non marcare di rosso
  // step che l'utente non ha ancora raggiunto (sarebbe un falso allarme,
  // dato che partono vuoti per costruzione).
  const [visitedSteps, setVisitedSteps] = useState<Set<string>>(new Set(['sezioni']))

  // Carica i template attivi all'avvio
  useEffect(() => {
    getTestTemplatesAttivi().then(setTemplates).catch(console.error)
  }, [])

  const STEPS = buildSteps(data.sezioni_attive, templates)
  const safeStep = Math.min(step, STEPS.length - 1)
  const current = STEPS[safeStep]

  const relazioneId = searchParams.get('relazioneId')
  const sessionId = searchParams.get('sessionId')
  const isModificaFlow = Boolean(isModificaRoute || relazioneId || data._relazioneId)
  const modeBadge = isModificaFlow
    ? 'Modifica da Archivio'
    : (isBozzaRoute || sessionId ? 'Bozza in corso' : null)
  const breadcrumb = isModificaFlow
    ? 'Archivio > Modifica relazione'
    : ((isBozzaRoute || sessionId)
      ? 'Bozze > Ripresa'
      : 'Nuova relazione')
  const title = isModificaFlow ? 'Modifica relazione' : (isBozzaRoute || sessionId ? 'Bozza in corso' : 'Nuova relazione')
  const subtitle = isModificaFlow
    ? `Step ${safeStep + 1} di ${STEPS.length} — Modifica guidata`
    : (isBozzaRoute || sessionId
      ? `Step ${safeStep + 1} di ${STEPS.length} — Ripresa bozza`
      : `Step ${safeStep + 1} di ${STEPS.length} — ${current.label}`)

  function normalizzaDatiIniziali(raw) {
    if (!raw) return INIT
    return {
      ...INIT,
      ...raw,
      cognitivo: {
        ...INIT.cognitivo,
        ...(raw.cognitivo || {}),
        // Nota: bozze salvate prima dell'introduzione dei punti ponderati
        // avevano "riferimenti_subtest" come testo libero (nomi dei subtest,
        // non punteggi) — non è convertibile in pp numerici, quindi viene
        // scartato e subtest_pp riparte vuoto per quelle bozze.
        subtest_pp: { ...INIT.cognitivo.subtest_pp, ...(raw.cognitivo?.subtest_pp || {}) },
      },
      nepsy: {
        ...INIT.nepsy,
        ...(raw.nepsy || {}),
      },
    }
  }

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        if (relazioneId) {
          const relazione = await getRelazioneById(relazioneId)
          if (relazione?.wizard_snapshot) {
            const paziente = relazione.paziente_id ? await getPazienteById(relazione.paziente_id) : null
            const payload = normalizzaDatiIniziali({
              ...relazione.wizard_snapshot,
              anagrafica: paziente ? {
                nome: paziente.nome || '',
                cognome: paziente.cognome || '',
                data_nascita: paziente.data_nascita || '',
                scuola_classe: paziente.scuola_classe || '',
              } : INIT.anagrafica,
              _relazioneId: relazione.id,
              _pazienteId: relazione.paziente_id,
              _relazioneTitolo: relazione.titolo || '',
            })
            if (live) {
              dispatch({ type: 'HYDRATE', payload })
              sessionIdRef.current = null
            }
          }
        } else if (sessionId) {
          const sessione = await getSessioneById(sessionId)
          if (sessione?.risposte_wizard) {
            const payload = normalizzaDatiIniziali({
              ...(sessione.risposte_wizard as UnknownRecord),
              _sessionId: sessione.id,
            })
            if (live) {
              dispatch({ type: 'HYDRATE', payload })
              sessionIdRef.current = sessione.id
            }
          }
        }
      } finally {
        if (live) setHydrating(false)
      }
    })()

    return () => { live = false }
  }, [searchParams])

  useEffect(() => {
    if (hydrating) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      toggleSaving()
      const s = await upsertSessione(sessionIdRef.current, { risposte_wizard: data })
      if (!sessionIdRef.current && s?.id) sessionIdRef.current = s.id
      toggleSaving()
    }, 1500)
    return () => clearTimeout(saveTimer.current)
  }, [data, hydrating])

  // Marca lo step corrente come visitato — usato per decidere se
  // mostrare l'indicatore rosso nella barra di progresso (uno step
  // mai visitato è "vuoto per natura", non "incompleto per errore").
  useEffect(() => {
    setVisitedSteps(prev => {
      if (prev.has(current.id)) return prev
      const next = new Set(prev)
      next.add(current.id)
      return next
    })
  }, [current.id])

  function setField(k, v) { dispatch({ type: 'SET', section: current.section, k, v }) }

  // Errori dello step corrente — array vuoto = step completo
  const currentStepErrors = validateStep(current.id, data, templates)

  function canProceed() {
    return currentStepErrors.length === 0
  }

  function canGenerate() {
    // La generazione richiede che OGNI step visitabile sia valido,
    // non solo l'ultimo — copre il caso in cui l'utente sia arrivato
    // alla fine saltando avanti da uno step con errori irrisolti.
    return STEPS.every(s => validateStep(s.id, data, templates).length === 0)
  }

  // Messaggi di errore aggregati per la generazione finale, utile
  // per lo StepFinale che mostra un riepilogo di cosa manca prima
  // di abilitare "Genera relazione".
  function erroriGenerazione() {
    return STEPS
      .map(s => ({ label: s.label, errori: validateStep(s.id, data, templates) }))
      .filter(s => s.errori.length > 0)
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">{title}</div>
          <div className="topbar-sub">{subtitle}</div>
          <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text-muted)' }}>{breadcrumb}</div>
          {modeBadge && (
            <div style={{ marginTop: 6 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--accent-dk)',
                background: 'var(--accent-lt)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '4px 10px',
              }}>
                {modeBadge}
              </span>
            </div>
          )}
        </div>
        {saving && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="spinner" style={{ width: 12, height: 12 }} /> Salvataggio automatico…
          </span>
        )}
      </div>

      <div className="page-body">
        {hydrating && (
          <div className="card" style={{ textAlign: 'center', padding: '34px 24px', marginBottom: 16 }}>
            <span className="spinner" style={{ width: 24, height: 24, margin: '0 auto 10px', display: 'block' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Caricamento bozza/modifica in corso…</p>
          </div>
        )}

        {USE_MOCK && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <FlaskConical size={15} style={{ flexShrink: 0 }} />
            <span>Modalità demo — le sessioni sono salvate solo in memoria (si azzerano al refresh).</span>
          </div>
        )}

        {/* Barra di progresso — 3 stati per segmento:
            grigio = mai visitato, accent = completo, rosso = visitato
            ma con campi obbligatori mancanti. Sempre cliccabile: la
            navigazione libera non è mai bloccata, solo segnalata. */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {STEPS.map((s, i) => {
            const errori = validateStep(s.id, data, templates)
            const isVisited = visitedSteps.has(s.id)
            const isIncomplete = isVisited && errori.length > 0 && i !== safeStep
            const color = isIncomplete
              ? 'var(--danger)'
              : (i <= safeStep ? 'var(--accent)' : 'var(--border)')
            return (
              <div
                key={s.id}
                style={{
                  flex: 1, height: 4, borderRadius: 2, background: color,
                  cursor: 'pointer', transition: 'background .2s',
                }}
                onClick={() => dispatchStep({ type: 'SET', value: i })}
                title={isIncomplete ? `${s.label} — incompleto: ${errori.join(', ')}` : s.label}
              />
            )
          })}
        </div>

        {/* Elenco testuale degli step incompleti — visibile solo se
            ce ne sono, per dare un quadro d'insieme senza dover
            passare il mouse su ogni singolo segmento colorato. */}
        {visitedSteps.size > 1 && STEPS.some(s => s.id !== current.id && visitedSteps.has(s.id) && validateStep(s.id, data, templates).length > 0) && (
          <div style={{ fontSize: 11.5, color: 'var(--danger)', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>Da completare:</span>
            {STEPS.filter(s => s.id !== current.id && visitedSteps.has(s.id) && validateStep(s.id, data, templates).length > 0).map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => dispatchStep({ type: 'SET', value: STEPS.findIndex(x => x.id === s.id) })}
                style={{
                  background: 'var(--danger-lt)', border: '1px solid #f5c6c2', color: 'var(--danger)',
                  borderRadius: 20, padding: '2px 9px', fontSize: 11, cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="card">
          {current.render(current.section ? data[current.section] : data, dispatch, setField)}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={() => dispatchStep({ type: 'PREV' })} disabled={safeStep === 0}>
              <ChevronLeft size={15} /> Indietro
            </button>
            {safeStep < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={() => dispatchStep({ type: 'NEXT' })} disabled={!canProceed()}>
                Avanti <ChevronRight size={15} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => navigate('/risultato', {
                  state: {
                    wizardData: {
                      ...data,
                      _sessionId: sessionIdRef.current,
                      _sourceRoute: `${location.pathname}${location.search || ''}`,
                    },
                  },
                })}
                disabled={!canGenerate()}
              >
                <Save size={15} /> Genera relazione
              </button>
            )}
          </div>

          {/* Messaggio inline con i campi mancanti dello step corrente —
              mai un bottone disabilitato senza spiegazione. */}
          {safeStep < STEPS.length - 1 && currentStepErrors.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8, textAlign: 'right' }}>
              Per proseguire completa: {currentStepErrors.join(', ')}
            </p>
          )}

          {/* Sull'ultimo step, riepilogo di TUTTI gli step ancora
              incompleti — copre il caso in cui l'utente sia arrivato
              qui saltando step con errori mai risolti. */}
          {safeStep === STEPS.length - 1 && !canGenerate() && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--danger)', textAlign: 'right' }}>
              {erroriGenerazione().map(({ label, errori }) => (
                <p key={label} style={{ margin: '2px 0' }}>
                  <strong>{label}:</strong> {errori.join(', ')}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
