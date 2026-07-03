import type { RisultatoTest } from './testTemplate'

export type Id = string

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type UnknownRecord = Record<string, unknown>

export type RelazioneOrigine = 'generata' | 'importata'
export type FileKind = 'docx' | 'doc' | 'pdf' | 'unsupported'
export type ImportableFileKind = Exclude<FileKind, 'unsupported'>

export type AnagraficaPaziente = {
  nome?: string | null
  cognome?: string | null
  data_nascita?: string | null
  scuola_classe?: string | null
}

export type Paziente = AnagraficaPaziente & {
  id: Id
  codice?: string | null
  eta_approssimativa?: number | null
  sesso?: string | null
  tipo_consulto?: string | null
  created_at?: string | null
}

export type Relazione = {
  id: Id
  created_at?: string | null
  updated_at?: string | null
  titolo?: string | null
  tipo?: RelazioneOrigine | string | null
  tipo_relazione?: string | null
  anno?: number | null
  paziente_id?: Id | null
  tag?: string[]
  testo_markdown?: string | null
  testo_anonimizzato?: string | null
  testo_originale_path?: string | null
  wizard_snapshot?: UnknownRecord | null
}

export type RelazioneInput = Omit<Relazione, 'id' | 'created_at'>
export type RelazionePatch = Partial<RelazioneInput>

export type ProfiloStileRecord = {
  documento_stile: string | null
  updated_at: string | null
  num_relazioni_analizzate: number
}

export type ProfiloProfessionista = {
  id?: number
  nome_completo?: string | null
  genere?: string | null
  titolo?: string | null
  specializzazione?: string | null
  email?: string | null
  telefono?: string | null
  indirizzo?: string | null
  citta?: string | null
  partita_iva?: string | null
  codice_fiscale?: string | null
  updated_at?: string | null
}

export type SessioneWizard = {
  id: Id
  created_at?: string | null
  updated_at?: string | null
  stato?: 'in_corso' | 'completata' | string
  step_corrente?: string | number | null
  dati?: UnknownRecord | null
  [key: string]: unknown
}

export type ExtractedText = {
  markdown: string
  warning?: string
}

export type ImportedFileStatus = 'converting' | 'ready' | 'saving' | 'saved' | 'error'

export type ImportedFileEntry = {
  id: Id
  name: string
  kind: FileKind
  status: ImportedFileStatus
  markdown: string
  file: File
  warning?: string
  errorMsg?: string
}

export type ImportRelazioneMeta = {
  titolo: string
  anno: number
  tipo_relazione: string
  codice_paziente: string
}

export type WizardSezione =
  | 'sezioni_attive'
  | 'anagrafica'
  | 'contesto'
  | 'anamnesi'
  | 'osservazione'
  | 'cognitivo'
  | 'nepsy'
  | 'apprendimenti'
  | 'questionari'
  | 'conclusioni'
  | 'finale'

export type WizardData = UnknownRecord & {
  sezioni_attive?: string[]
  anagrafica?: AnagraficaPaziente
  test_risultati?: Record<string, RisultatoTest>
  _relazioneId?: Id
  _pazienteId?: Id
}
