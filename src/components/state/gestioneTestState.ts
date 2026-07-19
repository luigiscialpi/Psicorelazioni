import type { ProfiloProfessionista, TemplateRilevatoItem } from '../../core/types'
import type { TestTemplate, SogliaCustom, ScalaPunteggio } from '../../core/testTemplate'

// ── Generazione slug automatica ───────────────────────────────
export function toSlug(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── Form state types ──────────────────────────────────────────
// Una colonna nel form: come ColonnaTest ma scala sempre presente come
// chiave (anche se undefined), più comodo da aggiornare nel reducer.
export type FormColonna = { nome: string; scala?: ScalaPunteggio; mostraFasciaInTabella?: boolean; evidenziato?: boolean }

// Configurazione di un campo "calcolato" (Totale): modo 'somma'/'media' genera
// automaticamente l'espressione dalle parti selezionate; 'avanzata' lascia
// scrivere l'espressione a mano (medie pesate, sottrazioni...).
export type FormFormula = {
  modo: 'somma' | 'media' | 'avanzata'
  parti: string[]
  espressioneAvanzata: string
  descrizione: string
}

export type FormCampo = { key: string; label: string; descr: string; evidenziato?: boolean; formula?: FormFormula }

export type FormState = {
  nome: string
  categoria: TestTemplate['categoria']
  scalaDefault: ScalaPunteggio
  mostraCategoriaDescrittiva: boolean
  campiPrincipali: FormCampo[]
  gruppiSecondari: Array<{ key: string; label: string; campi: Array<{ key: string; label: string }> }>
  colonne: FormColonna[]
  notaRange: string
  richiedeEtaValutazione: boolean
  richiedeStrumentiUtilizzati: boolean
}

export const INIT_FORM: FormState = {
  nome: '',
  categoria: 'altro',
  scalaDefault: { tipo: 'scalare' },
  mostraCategoriaDescrittiva: true,
  campiPrincipali: [{ key: '', label: '', descr: '' }],
  gruppiSecondari: [],
  colonne: [{ nome: 'Punteggio' }],
  notaRange: '',
  richiedeEtaValutazione: false,
  richiedeStrumentiUtilizzati: false,
}

// ── Reducer FormTemplate ──────────────────────────────────────
export type FormTemplateState = {
  form: FormState
  soglieCustom: SogliaCustom[]
  showPreview: boolean
  saving: boolean
  error: string
}

export type FormTemplateAction =
  | { type: 'SET_FIELD'; payload: { key: keyof FormState; value: any } }
  | { type: 'ADD_CAMPO' }
  | { type: 'REMOVE_CAMPO'; payload: number }
  | { type: 'UPDATE_CAMPO'; payload: { idx: number; field: string; value: string } }
  | { type: 'ADD_GRUPPO' }
  | { type: 'REMOVE_GRUPPO'; payload: number }
  | { type: 'UPDATE_GRUPPO'; payload: { idx: number; field: string; value: string } }
  | { type: 'ADD_CAMPO_GRUPPO'; payload: number }
  | { type: 'REMOVE_CAMPO_GRUPPO'; payload: { gi: number; ci: number } }
  | { type: 'UPDATE_CAMPO_GRUPPO'; payload: { gi: number; ci: number; field: string; value: string } }
  | { type: 'ADD_COLONNA' }
  | { type: 'REMOVE_COLONNA'; payload: number }
  | { type: 'UPDATE_COLONNA_NOME'; payload: { idx: number; value: string } }
  | { type: 'SET_COLONNA_SCALA_TIPO'; payload: { idx: number; tipo: ScalaPunteggio['tipo'] | null } }
  | { type: 'SET_COLONNA_SOGLIE'; payload: { idx: number; soglie: SogliaCustom[] } }
  | { type: 'SET_COLONNA_MOSTRA_FASCIA'; payload: { idx: number; value: boolean } }
  | { type: 'SET_COLONNA_EVIDENZIATO'; payload: { idx: number; value: boolean } }
  | { type: 'SET_CAMPO_EVIDENZIATO'; payload: { idx: number; value: boolean } }
  | { type: 'SET_CAMPO_FORMULA_MODO'; payload: { idx: number; modo: 'somma' | 'media' | 'avanzata' | null } }
  | { type: 'TOGGLE_CAMPO_FORMULA_PARTE'; payload: { idx: number; chiave: string } }
  | { type: 'SET_CAMPO_FORMULA_ESPRESSIONE'; payload: { idx: number; value: string } }
  | { type: 'SET_CAMPO_FORMULA_DESCRIZIONE'; payload: { idx: number; value: string } }
  | { type: 'SET_SOGLIE_CUSTOM'; payload: SogliaCustom[] }
  | { type: 'TOGGLE_PREVIEW' }
  | { type: 'START_SAVE' }
  | { type: 'SAVE_ERROR'; payload: string }
  | { type: 'SAVE_SUCCESS' }

export function formTemplateReducer(state: FormTemplateState, action: FormTemplateAction): FormTemplateState {
  switch (action.type) {
    case 'SET_FIELD':
      return {
        ...state,
        form: { ...state.form, [action.payload.key]: action.payload.value }
      }
    case 'ADD_CAMPO':
      return {
        ...state,
        form: {
          ...state.form,
          campiPrincipali: [...state.form.campiPrincipali, { key: '', label: '', descr: '' }]
        }
      }
    case 'REMOVE_CAMPO':
      return {
        ...state,
        form: {
          ...state.form,
          campiPrincipali: state.form.campiPrincipali.filter((_, idx) => idx !== action.payload)
        }
      }
    case 'UPDATE_CAMPO': {
      const next = state.form.campiPrincipali.map((c, idx) => {
        if (idx !== action.payload.idx) return c
        const updated = { ...c, [action.payload.field]: action.payload.value }
        if (action.payload.field === 'label') updated.key = toSlug(action.payload.value)
        return updated
      })
      return {
        ...state,
        form: { ...state.form, campiPrincipali: next }
      }
    }
    case 'ADD_GRUPPO':
      return {
        ...state,
        form: {
          ...state.form,
          gruppiSecondari: [...state.form.gruppiSecondari, { key: '', label: '', campi: [{ key: '', label: '' }] }]
        }
      }
    case 'REMOVE_GRUPPO':
      return {
        ...state,
        form: {
          ...state.form,
          gruppiSecondari: state.form.gruppiSecondari.filter((_, idx) => idx !== action.payload)
        }
      }
    case 'UPDATE_GRUPPO': {
      const next = state.form.gruppiSecondari.map((g, idx) => {
        if (idx !== action.payload.idx) return g
        const updated = { ...g, [action.payload.field]: action.payload.value }
        if (action.payload.field === 'label') updated.key = toSlug(action.payload.value)
        return updated
      })
      return {
        ...state,
        form: { ...state.form, gruppiSecondari: next }
      }
    }
    case 'ADD_CAMPO_GRUPPO': {
      const next = state.form.gruppiSecondari.map((g, idx) =>
        idx === action.payload ? { ...g, campi: [...g.campi, { key: '', label: '' }] } : g
      )
      return {
        ...state,
        form: { ...state.form, gruppiSecondari: next }
      }
    }
    case 'REMOVE_CAMPO_GRUPPO': {
      const { gi, ci } = action.payload
      const next = state.form.gruppiSecondari.map((g, idx) =>
        idx === gi ? { ...g, campi: g.campi.filter((_, cidx) => cidx !== ci) } : g
      )
      return {
        ...state,
        form: { ...state.form, gruppiSecondari: next }
      }
    }
    case 'UPDATE_CAMPO_GRUPPO': {
      const { gi, ci, field, value } = action.payload
      const next = state.form.gruppiSecondari.map((g, gidx) => {
        if (gidx !== gi) return g
        const nuoviCampi = g.campi.map((c, cidx) => {
          if (cidx !== ci) return c
          const updated = { ...c, [field]: value }
          if (field === 'label') updated.key = toSlug(value)
          return updated
        })
        return { ...g, campi: nuoviCampi }
      })
      return {
        ...state,
        form: { ...state.form, gruppiSecondari: next }
      }
    }
    case 'SET_SOGLIE_CUSTOM':
      return {
        ...state,
        soglieCustom: action.payload,
        form: {
          ...state.form,
          scalaDefault: { tipo: 'soglie_custom', soglie: action.payload }
        }
      }
    case 'ADD_COLONNA':
      // Nessun range di default: colonne diverse nello stesso test hanno quasi sempre
      // unità diverse (percentile, punteggio scalato, conteggio errori...) e applicare
      // automaticamente la scala del template produrrebbe fasce sbagliate/fuorvianti su
      // colonne che non la usano davvero. Impostarlo resta un click quando serve davvero.
      return {
        ...state,
        form: { ...state.form, colonne: [...state.form.colonne, { nome: '' }] }
      }
    case 'REMOVE_COLONNA':
      return {
        ...state,
        form: { ...state.form, colonne: state.form.colonne.filter((_, idx) => idx !== action.payload) }
      }
    case 'UPDATE_COLONNA_NOME': {
      const next = state.form.colonne.map((c, idx) =>
        idx === action.payload.idx ? { ...c, nome: action.payload.value } : c
      )
      return { ...state, form: { ...state.form, colonne: next } }
    }
    case 'SET_COLONNA_SCALA_TIPO': {
      const { idx, tipo } = action.payload
      const next = state.form.colonne.map((c, i) => {
        if (i !== idx) return c
        if (tipo === null) return { nome: c.nome } // nessun range: colonna solo informativa
        if (tipo === 'soglie_custom') {
          return { ...c, scala: { tipo: 'soglie_custom' as const, soglie: c.scala?.tipo === 'soglie_custom' ? c.scala.soglie : [] } }
        }
        return { ...c, scala: { tipo } }
      })
      return { ...state, form: { ...state.form, colonne: next } }
    }
    case 'SET_COLONNA_SOGLIE': {
      const { idx, soglie } = action.payload
      const next = state.form.colonne.map((c, i) =>
        i === idx ? { ...c, scala: { tipo: 'soglie_custom' as const, soglie } } : c
      )
      return { ...state, form: { ...state.form, colonne: next } }
    }
    case 'SET_COLONNA_MOSTRA_FASCIA': {
      const next = state.form.colonne.map((c, i) => i === action.payload.idx ? { ...c, mostraFasciaInTabella: action.payload.value } : c)
      return { ...state, form: { ...state.form, colonne: next } }
    }
    case 'SET_COLONNA_EVIDENZIATO': {
      const next = state.form.colonne.map((c, i) => i === action.payload.idx ? { ...c, evidenziato: action.payload.value } : c)
      return { ...state, form: { ...state.form, colonne: next } }
    }
    case 'SET_CAMPO_EVIDENZIATO': {
      const next = state.form.campiPrincipali.map((c, i) => i === action.payload.idx ? { ...c, evidenziato: action.payload.value } : c)
      return { ...state, form: { ...state.form, campiPrincipali: next } }
    }
    case 'SET_CAMPO_FORMULA_MODO': {
      const { idx, modo } = action.payload
      const next = state.form.campiPrincipali.map((c, i) => {
        if (i !== idx) return c
        if (modo === null) { const { formula: _formula, ...senzaFormula } = c; return senzaFormula }
        const precedente = c.formula
        return {
          ...c,
          formula: {
            modo,
            parti: precedente?.parti || [],
            espressioneAvanzata: precedente?.espressioneAvanzata || '',
            descrizione: precedente?.descrizione || '',
          },
        }
      })
      return { ...state, form: { ...state.form, campiPrincipali: next } }
    }
    case 'TOGGLE_CAMPO_FORMULA_PARTE': {
      const { idx, chiave } = action.payload
      const next = state.form.campiPrincipali.map((c, i) => {
        if (i !== idx || !c.formula) return c
        const parti = c.formula.parti.includes(chiave)
          ? c.formula.parti.filter(k => k !== chiave)
          : [...c.formula.parti, chiave]
        return { ...c, formula: { ...c.formula, parti } }
      })
      return { ...state, form: { ...state.form, campiPrincipali: next } }
    }
    case 'SET_CAMPO_FORMULA_ESPRESSIONE': {
      const { idx, value } = action.payload
      const next = state.form.campiPrincipali.map((c, i) =>
        i === idx && c.formula ? { ...c, formula: { ...c.formula, espressioneAvanzata: value } } : c
      )
      return { ...state, form: { ...state.form, campiPrincipali: next } }
    }
    case 'SET_CAMPO_FORMULA_DESCRIZIONE': {
      const { idx, value } = action.payload
      const next = state.form.campiPrincipali.map((c, i) =>
        i === idx && c.formula ? { ...c, formula: { ...c.formula, descrizione: value } } : c
      )
      return { ...state, form: { ...state.form, campiPrincipali: next } }
    }
    case 'TOGGLE_PREVIEW':
      return {
        ...state,
        showPreview: !state.showPreview
      }
    case 'START_SAVE':
      return {
        ...state,
        saving: true,
        error: ''
      }
    case 'SAVE_ERROR':
      return {
        ...state,
        saving: false,
        error: action.payload
      }
    case 'SAVE_SUCCESS':
      return {
        ...state,
        saving: false
      }
    default:
      return state
  }
}

// ── Reducer GestioneTest ──────────────────────────────────────
export type GestioneTestState = {
  templates: TestTemplate[]
  loading: boolean
  showForm: boolean
  formInitial: FormState | undefined
  editingTemplateId: string | null
  confirmDisattiva: string | null
  confirmDelete: string | null
  profilo: ProfiloProfessionista | null
  successo: string
  suggerimenti: string[]
  suggerimentiProfilo: TemplateRilevatoItem[]
  loadingProfilo: boolean
  erroreProfilo: string
  loadingEstraiTest: string | null
  accordionAperto: boolean
}

export type GestioneTestAction =
  | { type: 'LOAD_DATA_SUCCESS'; payload: { templates: TestTemplate[]; profilo: ProfiloProfessionista | null; suggerimentiProfilo: TemplateRilevatoItem[] } }
  | { type: 'SET_SUGGERIMENTI'; payload: string[] }
  | { type: 'OPEN_CREATE_FORM' }
  | { type: 'OPEN_EDIT_FORM'; payload: { initial: FormState; id: string } }
  | { type: 'CLOSE_FORM' }
  | { type: 'START_ESTRAZIONE_PROFILO' }
  | { type: 'ESTRAZIONE_PROFILO_SUCCESS'; payload: { suggerimentiProfilo: TemplateRilevatoItem[]; successo?: string } }
  | { type: 'ESTRAZIONE_PROFILO_ERROR'; payload: string }
  | { type: 'START_PRECOMPILAZIONE'; payload: string }
  | { type: 'PRECOMPILAZIONE_SUCCESS'; payload: { initial: FormState; suggerimentiProfilo: TemplateRilevatoItem[] } }
  | { type: 'PRECOMPILAZIONE_ERROR'; payload: string }
  | { type: 'SET_CONFIRM_DISATTIVA'; payload: string | null }
  | { type: 'SET_CONFIRM_DELETE'; payload: string | null }
  | { type: 'OPERATION_SUCCESS'; payload: { templates: TestTemplate[]; successo: string } }
  | { type: 'SET_SUCCESS_MSG'; payload: string }
  | { type: 'CLEAR_SUCCESS_MSG' }
  | { type: 'SET_ACCORDION_APERTO'; payload: boolean }
  | { type: 'CLEAR_SUGGERIMENTI_PROFILO' }

export const GESTIONE_TEST_INIT: GestioneTestState = {
  templates: [],
  loading: true,
  showForm: false,
  formInitial: undefined,
  editingTemplateId: null,
  confirmDisattiva: null,
  confirmDelete: null,
  profilo: null,
  successo: '',
  suggerimenti: [],
  suggerimentiProfilo: [],
  loadingProfilo: false,
  erroreProfilo: '',
  loadingEstraiTest: null,
  accordionAperto: true,
}

export function gestioneTestReducer(state: GestioneTestState, action: GestioneTestAction): GestioneTestState {
  switch (action.type) {
    case 'LOAD_DATA_SUCCESS':
      return {
        ...state,
        templates: action.payload.templates,
        profilo: action.payload.profilo,
        suggerimentiProfilo: action.payload.suggerimentiProfilo,
        loading: false,
      }
    case 'SET_SUGGERIMENTI':
      return {
        ...state,
        suggerimenti: action.payload,
      }
    case 'OPEN_CREATE_FORM':
      return {
        ...state,
        formInitial: undefined,
        showForm: true,
        editingTemplateId: null,
      }
    case 'OPEN_EDIT_FORM':
      return {
        ...state,
        formInitial: action.payload.initial,
        showForm: true,
        editingTemplateId: action.payload.id,
      }
    case 'CLOSE_FORM':
      return {
        ...state,
        showForm: false,
        editingTemplateId: null,
        formInitial: undefined,
      }
    case 'START_ESTRAZIONE_PROFILO':
      return {
        ...state,
        loadingProfilo: true,
        erroreProfilo: '',
      }
    case 'ESTRAZIONE_PROFILO_SUCCESS':
      return {
        ...state,
        loadingProfilo: false,
        suggerimentiProfilo: action.payload.suggerimentiProfilo,
        accordionAperto: action.payload.suggerimentiProfilo.length > 0 ? true : state.accordionAperto,
        successo: action.payload.successo || state.successo,
      }
    case 'ESTRAZIONE_PROFILO_ERROR':
      return {
        ...state,
        loadingProfilo: false,
        erroreProfilo: action.payload,
      }
    case 'START_PRECOMPILAZIONE':
      return {
        ...state,
        loadingEstraiTest: action.payload,
        erroreProfilo: '',
      }
    case 'PRECOMPILAZIONE_SUCCESS':
      return {
        ...state,
        loadingEstraiTest: null,
        formInitial: action.payload.initial,
        showForm: true,
        suggerimentiProfilo: action.payload.suggerimentiProfilo,
      }
    case 'PRECOMPILAZIONE_ERROR':
      return {
        ...state,
        loadingEstraiTest: null,
        erroreProfilo: action.payload,
      }
    case 'SET_CONFIRM_DISATTIVA':
      return {
        ...state,
        confirmDisattiva: action.payload,
      }
    case 'SET_CONFIRM_DELETE':
      return {
        ...state,
        confirmDelete: action.payload,
      }
    case 'OPERATION_SUCCESS':
      return {
        ...state,
        templates: action.payload.templates,
        successo: action.payload.successo,
      }
    case 'SET_SUCCESS_MSG':
      return {
        ...state,
        successo: action.payload,
      }
    case 'CLEAR_SUCCESS_MSG':
      return {
        ...state,
        successo: '',
      }
    case 'SET_ACCORDION_APERTO':
      return {
        ...state,
        accordionAperto: action.payload,
      }
    case 'CLEAR_SUGGERIMENTI_PROFILO':
      return {
        ...state,
        suggerimentiProfilo: [],
      }
    default:
      return state
  }
}
