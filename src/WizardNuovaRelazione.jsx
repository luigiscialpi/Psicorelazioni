import { useReducer, useEffect, useRef } from 'react'
import { ChevronRight, ChevronLeft, Save, FlaskConical, Check, ShieldAlert } from 'lucide-react'
import { upsertSessione, USE_MOCK } from './dataService'
import { WISC_IV_CAMPI, NEPSY_II_DOMINI, fasciaWISC, fasciaScalare } from './testDefinitions'
import {
  ANAMNESI_REMOTA_VOCI, ANAMNESI_RECENTE_VOCI,
  OSSERVAZIONE_ADATTAMENTO_VOCI, OSSERVAZIONE_ATTEGGIAMENTO_VOCI,
} from './anamnesiVoci'

// ─────────────────────────────────────────────────────────────
// Wizard calibrato sulla struttura reale di relazioni di
// valutazione neuropsicologica/apprendimento.
//
// PRINCIPIO CHIAVE: i dati anagrafici REALI (nome, cognome, data
// di nascita) vengono raccolti qui ma NON fanno mai parte del
// payload mandato a Gemini — restano lato client e vengono
// ricomposti nel documento finale solo in fase di export DOCX
// (vedi RisultatoGenerazione.jsx + exportDocx.js). Gemini vede
// sempre e solo "il/la paziente", mai un nome reale.
//
// I punteggi dei test (WISC-IV, NEPSY-II) sono input numerici
// guidati per singolo indice/subtest — la tabella Word e le fasce
// interpretative ("Media", "Superiore"...) sono calcolate in
// automatico, non richiedono che tua sorella le scriva a mano.
// ─────────────────────────────────────────────────────────────

const SEZIONI_DISPONIBILI = [
  { id: 'anamnesi',      label: 'Anamnesi (remota e recente)',         default: true },
  { id: 'osservazione',  label: 'Osservazione comportamentale',         default: true },
  { id: 'cognitivo',     label: 'Valutazione cognitiva (WISC-IV)',      default: true },
  { id: 'nepsy',         label: 'Approfondimento neuropsicologico (NEPSY-II)', default: false },
  { id: 'apprendimenti', label: 'Valutazione apprendimenti (lettura/scrittura/matematica)', default: false },
  { id: 'questionari',   label: 'Questionari (CBCL/YSR/Conners...)',    default: false },
  { id: 'conclusioni',   label: 'Conclusioni e diagnosi',               default: true },
]

const TIPI_INVIO = ['neuropsichiatra infantile', 'scuola', 'famiglia (privato)', 'altro specialista', 'altro']

const INIT = {
  sezioni_attive: SEZIONI_DISPONIBILI.filter(s => s.default).map(s => s.id),

  // ⚠️ ANAGRAFICA REALE — non va mai a Gemini, solo nel DOCX finale
  anagrafica: { nome: '', cognome: '', data_nascita: '', scuola_classe: '' },

  // Contesto invio — questo invece può andare a Gemini (nessun dato identificativo)
  motivo_invio: '', tipo_invio: '', nome_inviante: '',
  paziente_nuovo: true, codice_paziente: '',

  anamnesi:      { remota_voci: [], remota_dettagli: {}, remota_extra: '', recente_voci: [], recente_dettagli: {}, recente_extra: '' },
  osservazione:  { adattamento_voci: [], atteggiamento_voci: [], note: '' },
  cognitivo:     { somministrato: true, punteggi: {}, note_cliniche: '' },
  nepsy:         { somministrato: true, punteggi: {}, note_cliniche: '' },
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

// ── Checkbox riutilizzabile con dettaglio opzionale ────────
function VoceCheckbox({ voce, checked, onToggle, dettaglio, onDettaglio }) {
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
          onChange={e => onDettaglio(e.target.value)}
        />
      )}
    </div>
  )
}

// ── Step 0 — Selezione sezioni ─────────────────────────────
function StepSezioni({ data, dispatch }) {
  return (
    <div>
      <h3 style={sh}>Quali sezioni includere?</h3>
      <p style={shSub}>Seleziona solo le valutazioni effettivamente svolte per questo caso.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SEZIONI_DISPONIBILI.map(s => {
          const attiva = data.sezioni_attive.includes(s.id)
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
              <span style={{ fontSize: 13.5, color: attiva ? 'var(--accent-dk)' : 'var(--text)', fontWeight: attiva ? 500 : 400 }}>{s.label}</span>
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
          <label className="form-label">Nome</label>
          <input className="form-input" value={data.nome} onChange={e => set('nome', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Cognome</label>
          <input className="form-input" value={data.cognome} onChange={e => set('cognome', e.target.value)} />
        </div>
      </div>
      <div className="meta-row">
        <div className="form-group">
          <label className="form-label">Data di nascita</label>
          <input className="form-input" type="date" value={data.data_nascita} onChange={e => set('data_nascita', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Scuola / classe</label>
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
      <p style={shSub}>Questi dati possono essere elaborati dall'AI: non contengono informazioni identificative.</p>

      <div className="form-group">
        <label className="form-label">Riferimento interno <span>(facoltativo, per ritrovare il caso in archivio)</span></label>
        <input className="form-input" placeholder="es. codice fascicolo interno" value={data.codice_paziente} onChange={e => set('codice_paziente', e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">Motivo dell'invio</label>
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
function StepCognitivo({ data, dispatch }) {
  return (
    <div>
      <h3 style={sh}>Valutazione cognitiva — WISC-IV</h3>
      <p style={shSub}>Inserisci i punteggi standard per ciascun indice. Fascia interpretativa calcolata automaticamente.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {WISC_IV_CAMPI.map(campo => {
          const val = data.punteggi[campo.key] || ''
          const fascia = fasciaWISC(val)
          return (
            <div key={campo.key} style={{
              display: 'grid', gridTemplateColumns: '1fr 90px 140px', gap: 10, alignItems: 'center',
              padding: '8px 10px', borderRadius: 'var(--radius)',
              background: campo.tipo === 'totale' ? 'var(--accent-lt)' : 'transparent',
            }}>
              <span style={{ fontSize: 12.5, fontWeight: campo.tipo === 'totale' ? 600 : 400 }}>{campo.label}</span>
              <input
                className="form-input" type="number" min="40" max="160" placeholder="—"
                value={val}
                onChange={e => dispatch({ type: 'SET_NESTED', section: 'cognitivo', group: 'punteggi', k: campo.key, v: e.target.value })}
                style={{ textAlign: 'center', padding: '6px 8px' }}
              />
              <span style={{ fontSize: 11.5, color: fascia ? 'var(--accent-dk)' : 'var(--text-muted)', fontWeight: fascia ? 500 : 400 }}>
                {fascia || '—'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="form-group" style={{ marginTop: 18 }}>
        <label className="form-label">Note cliniche aggiuntive <span>(facoltativo)</span></label>
        <textarea className="form-textarea" rows={3} placeholder="Osservazioni durante la somministrazione…"
          value={data.note_cliniche} onChange={e => dispatch({ type: 'SET', section: 'cognitivo', k: 'note_cliniche', v: e.target.value })} />
      </div>
    </div>
  )
}

// ── Step NEPSY — input numerici guidati per dominio ─────────
function StepNepsy({ data, dispatch }) {
  return (
    <div>
      <h3 style={sh}>Approfondimento neuropsicologico — NEPSY-II</h3>
      <p style={shSub}>Punteggi scalari per subtest (media 10, DS 3). Compila solo i subtest somministrati.</p>

      {NEPSY_II_DOMINI.map(dom => (
        <div key={dom.dominio} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent-dk)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            {dom.dominio}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dom.subtest.map(st => {
              const val = data.punteggi[st.key] || ''
              const fascia = fasciaScalare(val)
              return (
                <div key={st.key} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 140px', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5 }}>{st.label}</span>
                  <input
                    className="form-input" type="number" min="1" max="19" placeholder="—"
                    value={val}
                    onChange={e => dispatch({ type: 'SET_NESTED', section: 'nepsy', group: 'punteggi', k: st.key, v: e.target.value })}
                    style={{ textAlign: 'center', padding: '6px 8px' }}
                  />
                  <span style={{ fontSize: 11.5, color: fascia ? 'var(--accent-dk)' : 'var(--text-muted)', fontWeight: fascia ? 500 : 400 }}>
                    {fascia || '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="form-group">
        <label className="form-label">Note cliniche aggiuntive <span>(facoltativo)</span></label>
        <textarea className="form-textarea" rows={3}
          value={data.note_cliniche} onChange={e => dispatch({ type: 'SET', section: 'nepsy', k: 'note_cliniche', v: e.target.value })} />
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
        <div className="form-group"><label className="form-label">Diagnosi</label><input className="form-input" value={data.diagnosi} onChange={e => set('diagnosi', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Codice ICD <span>(facoltativo)</span></label><input className="form-input" value={data.codice_icd} onChange={e => set('codice_icd', e.target.value)} /></div>
      </div>
      <div className="form-group"><label className="form-label">Consigli al paziente / famiglia</label><textarea className="form-textarea" rows={3} value={data.consigli_paziente} onChange={e => set('consigli_paziente', e.target.value)} /></div>
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
function buildSteps(sezioniAttive) {
  const steps = [
    { id: 'sezioni',    label: 'Sezioni',     section: null,     render: (d, dp) => <StepSezioni data={d} dispatch={dp} /> },
    { id: 'anagrafica', label: 'Anagrafica',  section: 'anagrafica', render: (d, dp, set) => <StepAnagrafica data={d} set={set} /> },
    { id: 'contesto',   label: 'Contesto',    section: null,     render: (d, dp, set) => <StepContesto data={d} set={set} /> },
  ]

  if (sezioniAttive.includes('anamnesi'))
    steps.push({ id: 'anamnesi', label: 'Anamnesi', section: 'anamnesi', render: (d, dp) => <StepAnamnesi data={d} dispatch={dp} /> })

  if (sezioniAttive.includes('osservazione'))
    steps.push({ id: 'osservazione', label: 'Osservazione', section: 'osservazione', render: (d, dp) => <StepOsservazione data={d} dispatch={dp} /> })

  if (sezioniAttive.includes('cognitivo'))
    steps.push({ id: 'cognitivo', label: 'Cognitivo', section: 'cognitivo', render: (d, dp) => <StepCognitivo data={d} dispatch={dp} /> })

  if (sezioniAttive.includes('nepsy'))
    steps.push({ id: 'nepsy', label: 'NEPSY', section: 'nepsy', render: (d, dp) => <StepNepsy data={d} dispatch={dp} /> })

  if (sezioniAttive.includes('apprendimenti'))
    steps.push({ id: 'apprendimenti', label: 'Apprendimenti', section: 'apprendimenti', render: (d, dp, set) => <StepApprendimenti data={d} set={set} /> })

  if (sezioniAttive.includes('questionari'))
    steps.push({ id: 'questionari', label: 'Questionari', section: 'questionari', render: (d, dp, set) => <StepQuestionari data={d} set={set} /> })

  if (sezioniAttive.includes('conclusioni'))
    steps.push({ id: 'conclusioni', label: 'Conclusioni', section: 'conclusioni', render: (d, dp, set) => <StepConclusioni data={d} set={set} /> })

  steps.push({ id: 'finale', label: 'Dettagli finali', section: null, render: (d, dp, set) => <StepFinale data={d} set={set} /> })

  return steps
}

// ── Componente principale ──────────────────────────────────
export default function WizardNuovaRelazione({ onGenera, datiIniziali }) {
  const [data, dispatch] = useReducer(wizardReducer, datiIniziali ? { ...INIT, ...datiIniziali } : INIT)
  const [step, dispatchStep] = useReducer((s, a) => a.type === 'NEXT' ? s + 1 : a.type === 'PREV' ? Math.max(0, s - 1) : a.value, 0)
  const sessionIdRef = useRef(null)
  const [saving, toggleSaving] = useReducer(s => !s, false)
  const saveTimer = useRef(null)

  const STEPS = buildSteps(data.sezioni_attive)
  const safeStep = Math.min(step, STEPS.length - 1)
  const current = STEPS[safeStep]

  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      toggleSaving()
      const s = await upsertSessione(sessionIdRef.current, { risposte_wizard: data })
      if (!sessionIdRef.current && s?.id) sessionIdRef.current = s.id
      toggleSaving()
    }, 1500)
    return () => clearTimeout(saveTimer.current)
  }, [data])

  function setField(k, v) { dispatch({ type: 'SET', section: current.section, k, v }) }

  function canProceed() {
    if (current.id === 'sezioni' && data.sezioni_attive.length === 0) return false
    return true
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Nuova relazione</div>
          <div className="topbar-sub">Step {safeStep + 1} di {STEPS.length} — {current.label}</div>
        </div>
        {saving && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="spinner" style={{ width: 12, height: 12 }} /> Salvataggio automatico…
          </span>
        )}
      </div>

      <div className="page-body">
        {USE_MOCK && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <FlaskConical size={15} style={{ flexShrink: 0 }} />
            <span>Modalità demo — le sessioni sono salvate solo in memoria (si azzerano al refresh).</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= safeStep ? 'var(--accent)' : 'var(--border)',
              cursor: i < safeStep ? 'pointer' : 'default', transition: 'background .2s',
            }} onClick={() => i < safeStep && dispatchStep({ type: 'SET', value: i })} title={s.label} />
          ))}
        </div>

        <div className="card">
          {current.render(current.section ? data[current.section] : data, dispatch, setField)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => dispatchStep({ type: 'PREV' })} disabled={safeStep === 0}>
            <ChevronLeft size={15} /> Indietro
          </button>
          {safeStep < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => dispatchStep({ type: 'NEXT' })} disabled={!canProceed()}>
              Avanti <ChevronRight size={15} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => onGenera(data, sessionIdRef.current)}>
              <Save size={15} /> Genera relazione
            </button>
          )}
        </div>
      </div>
    </>
  )
}
