// ============================================================
// GEMINI SERVICE — chiama l'API o restituisce output mock
// Calibrato sulla struttura reale di relazioni di valutazione
// neuropsicologica/apprendimento (WISC-IV, NEPSY-II, CBCL/YSR...),
// identificata analizzando 3 relazioni reali (lette privatamente,
// mai usate come contenuto — solo per ricavarne lo scheletro).
// ============================================================

import {
  wiscToMarkdownTable, wiscToNarrativa, wiscSubtestPpToNarrativa, nepsyToMarkdownTable, nepsyToNarrativa,
  notaRangeWisc, notaRangeNepsy, assemblaDocumentoMarkdown,
} from './wizardToText'
import { getPazienteById } from '../data/pazientiData'
import { anonimizzaTesto } from './anonimizza'
import {
  ANAMNESI_REMOTA_VOCI, ANAMNESI_RECENTE_VOCI,
  OSSERVAZIONE_ADATTAMENTO_VOCI, OSSERVAZIONE_ATTEGGIAMENTO_VOCI,
} from '../components/constants/anamnesiVoci'
import type { Paziente, Relazione, UnknownRecord } from '../core/types'

type GeminiCallOptions = {
  maxOutputTokens?: number
  temperature?: number
  thinkingBudget?: number
}

type GeminiErrorDetail = {
  description?: string
  reason?: string
  message?: string
}

type GeminiErrorPayload = {
  error?: {
    message?: string
    status?: string
    code?: string | number
    details?: GeminiErrorDetail[]
  }
}

type GeminiResponse = GeminiErrorPayload & {
  candidates?: Array<{
    finishReason?: string
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}

type CorpusPlan = {
  corpus: string
  charsCorpus: number
  usate: number
  totali: number
  indiciUsati: number[]
}

type AiResult = {
  testo: string
  relazioniUsate: number
  relazioniTotali: number
  charsCorpus: number
}

type ScoreMap = Record<string, string | number | boolean | null | undefined>

type WizardPayload = UnknownRecord & {
  anagrafica?: unknown
  sezioni_attive?: string[]
  tipo_invio?: string
  motivo_invio?: string
  anamnesi?: UnknownRecord
  osservazione?: UnknownRecord & { note?: string }
  cognitivo?: UnknownRecord & {
    punteggi?: ScoreMap
    includi_nota_range?: boolean
    subtest_pp?: ScoreMap
    eta_valutazione?: string
    strumenti_utilizzati?: string
    note_cliniche?: string
  }
  nepsy?: UnknownRecord & {
    punteggi?: ScoreMap
    includi_nota_range?: boolean
    strumenti_utilizzati?: string
    note_cliniche?: string
  }
  apprendimenti?: UnknownRecord & {
    strumenti?: string
    punteggi_grezzi?: string
    lettura?: string
    scrittura?: string
    matematica?: string
  }
  questionari?: UnknownRecord & {
    tipo?: string
    punteggi_grezzi?: string
    note_cliniche?: string
  }
  conclusioni?: UnknownRecord & {
    diagnosi?: string
    codice_icd?: string
    consigli_paziente?: string
    consigli_scuola?: string
    strumenti_compensativi?: string
    misure_dispensative?: string
  }
}

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''
const USE_MOCK_AI = !API_KEY || API_KEY === 'YOUR_GEMINI_KEY'

// Fallback predefinito basato sui modelli testuali comunemente disponibili nel piano senza costi.
// Nota: la disponibilita reale dipende sempre da progetto, quota e stato account in AI Studio.
const DEFAULT_FREE_MODEL_FALLBACK = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
]

const MODEL_CONFIG = import.meta.env.VITE_GEMINI_MODELS
  ? String(import.meta.env.VITE_GEMINI_MODELS)
  : import.meta.env.VITE_GEMINI_MODEL ||
    DEFAULT_FREE_MODEL_FALLBACK.join(',')

const MODEL_CANDIDATES = MODEL_CONFIG
  .split(',')
  .map((m: string) => m.trim())
  .filter(Boolean)
  .filter((m: string, idx: number, arr: string[]) => arr.indexOf(m) === idx)

function buildEndpoint(modelName: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`
}

function erroreQuotaEsaurita(status: number, dettaglio: unknown) {
  if (status !== 429) return false
  const d = String(dettaglio || '').toLowerCase()
  return d.includes('quota exceeded') || d.includes('resource_exhausted') || d.includes('free_tier')
}

function erroreModelloNonDisponibile(status: number, dettaglio: unknown) {
  if (status !== 400 && status !== 404) return false
  const d = String(dettaglio || '').toLowerCase()
  return (
    d.includes('model') && (d.includes('not found') || d.includes('not supported') || d.includes('not available'))
  )
}
const MAX_CORPUS_CHARS = 240000
const MAX_RELATION_CHARS = 90000

export const CORPUS_LIMITI = {
  maxCorpusChars: MAX_CORPUS_CHARS,
  maxRelazioneChars: MAX_RELATION_CHARS,
}

function estraiMessaggioErroreGemini(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const err = (payload as GeminiErrorPayload).error
  if (!err) return null
  const parti = [err.message, err.status, err.code].filter(Boolean)
  const dettagli = Array.isArray(err.details)
    ? err.details
      .map((d: GeminiErrorDetail) => d?.description || d?.reason || d?.message)
      .filter(Boolean)
    : []
  return [...parti, ...dettagli].join(' | ') || null
}

function troncaTestoPerCorpus(testo: unknown, maxChars = MAX_RELATION_CHARS): string {
  const value = String(testo || '')
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n\n[...CONTENUTO TRONCATO AUTOMATICAMENTE PER LIMITI PAYLOAD...]`
}

function costruisciCorpus(relazioni: Relazione[], labelPrefix = 'RELAZIONE'): CorpusPlan {
  let used = 0
  const chunks: string[] = []
  const indiciUsati: number[] = []

  for (let i = 0; i < relazioni.length; i++) {
    const r = relazioni[i]
    const header = `--- ${labelPrefix} ${i + 1} (${r.tipo_relazione || 'tipo non specificato'}) ---\n`
    const body = troncaTestoPerCorpus(r.testo_anonimizzato)
    const chunk = `${header}${body}`
    const nextUsed = used + chunk.length + 2

    if (nextUsed > MAX_CORPUS_CHARS) break
    chunks.push(chunk)
    indiciUsati.push(i)
    used = nextUsed
  }

  if (chunks.length === 0 && relazioni.length > 0) {
    const r = relazioni[0]
    chunks.push(`--- ${labelPrefix} 1 (${r.tipo_relazione || 'tipo non specificato'}) ---\n${troncaTestoPerCorpus(r.testo_anonimizzato, Math.max(10000, MAX_CORPUS_CHARS - 2000))}`)
    indiciUsati.push(0)
  }

  return {
    corpus: chunks.join('\n\n'),
    charsCorpus: chunks.join('\n\n').length,
    usate: chunks.length,
    totali: relazioni.length,
    indiciUsati,
  }
}

async function callGemini(systemPrompt: string, userPrompt: string, options: GeminiCallOptions = {}): Promise<string> {
  const {
    maxOutputTokens = 4096,
    temperature = 0.7,
    thinkingBudget = 0,
  } = options

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget },
    },
  }
  let lastErr: Error | null = null

  for (let modelIndex = 0; modelIndex < MODEL_CANDIDATES.length; modelIndex++) {
    const modelName = MODEL_CANDIDATES[modelIndex]
    const endpoint = buildEndpoint(modelName)
    const maxAttempts = 3

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      let data: GeminiResponse | null = null
      let raw = ''
      try {
        data = await res.json() as GeminiResponse
      } catch {
        try { raw = await res.text() } catch { raw = '' }
      }

      if (res.ok) {
        const candidate = data?.candidates?.[0]
        const text = candidate?.content?.parts?.[0]?.text || ''

        if (candidate?.finishReason === 'MAX_TOKENS') {
          lastErr = new Error(`Gemini response truncated [${modelName}] per limite token output. Riduci il corpus o aumenta maxOutputTokens.`)
          if (attempt < maxAttempts) continue
          throw lastErr
        }

        return text
      }

      const dettaglio = estraiMessaggioErroreGemini(data) || raw || 'Errore sconosciuto'
      lastErr = new Error(`Gemini API error ${res.status} [${modelName}]: ${dettaglio}`)

      if (erroreQuotaEsaurita(res.status, dettaglio) && modelIndex < MODEL_CANDIDATES.length - 1) {
        // Prova automaticamente il modello successivo se questo e in quota zero.
        break
      }

      if (erroreModelloNonDisponibile(res.status, dettaglio) && modelIndex < MODEL_CANDIDATES.length - 1) {
        // Se il modello non esiste/non e disponibile in questo account, passa al successivo.
        break
      }

      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
        const waitMs = 4000 * Math.pow(2, attempt - 1)
        await new Promise<void>(resolve => setTimeout(resolve, waitMs))
        continue
      }

      throw lastErr
    }
  }

  throw lastErr || new Error('Gemini API error: richiesta non completata')
}

async function anonimizzaRelazioniPerAnalisi(relazioni: Relazione[]): Promise<Relazione[]> {
  return Promise.all((relazioni || []).map(async (r: Relazione) => {
    let paziente: Paziente | null = null
    if (r?.paziente_id) {
      try {
        paziente = await getPazienteById(r.paziente_id)
      } catch {
        paziente = null
      }
    }

    return {
      ...r,
      testo_anonimizzato: anonimizzaTesto(r?.testo_markdown || '', { paziente }),
    }
  }))
}

export async function preparaAnteprimaAnonimizzazione(relazioni: Relazione[]): Promise<Relazione[]> {
  return anonimizzaRelazioniPerAnalisi(relazioni)
}

export async function pianificaInvioRelazioni(relazioni: Relazione[], labelPrefix = 'RELAZIONE') {
  const relazioniAnonimizzate = await anonimizzaRelazioniPerAnalisi(relazioni)
  const piano = costruisciCorpus(relazioniAnonimizzate, labelPrefix)
  const relazioniDaInviare = piano.indiciUsati.map((i: number) => relazioni[i]).filter(Boolean)
  const anteprimaDaInviare = piano.indiciUsati.map((i: number) => relazioniAnonimizzate[i]).filter(Boolean)

  return {
    relazioniAnonimizzate,
    relazioniDaInviare,
    anteprimaDaInviare,
    conteggioDaInviare: relazioniDaInviare.length,
    conteggioInCoda: Math.max(0, relazioni.length - relazioniDaInviare.length),
    charsCorpus: piano.charsCorpus,
    limiti: CORPUS_LIMITI,
  }
}

// ── ANALISI STILE ──────────────────────────────────────────
export async function analizzaStile(relazioni: Relazione[]): Promise<AiResult> {
  const relazioniAnonimizzate = await anonimizzaRelazioniPerAnalisi(relazioni)
  const { corpus, usate, totali, charsCorpus } = costruisciCorpus(relazioniAnonimizzate, 'RELAZIONE')

  if (USE_MOCK_AI) {
    await new Promise<void>(resolve => setTimeout(resolve, 1800))
    const testo = `# PROFILO DI STILE — Valutazioni neuropsicologiche
Ultimo aggiornamento: ${new Date().toISOString().slice(0,10)} | Relazioni analizzate: ${relazioniAnonimizzate.length} | Versione: 1

## 1. Struttura standard (ORDINE INVARIABILE)
1. Intestazione professionale (nome, qualifica, specializzazione) — fissa, da template
2. Apertura anagrafica: nome/codice paziente, data di nascita, chi invia, motivo dell'invio
3. Anamnesi remota (storia diagnostica pregressa)
4. Anamnesi recente / contesto scolastico attuale
5. Osservazione del comportamento al colloquio
6. Valutazione cognitiva (es. WISC-IV) — tabella punteggi + descrizione narrativa di ciascun indice
7. Approfondimento neuropsicologico (es. NEPSY-II) — tabella + narrativa
8. Valutazione apprendimenti, quando pertinente (lettura/scrittura/matematica)
9. Questionari (CBCL/YSR, Conners...) — confronto genitori vs autovalutazione
10. Conclusioni: sintesi, diagnosi con codice ICD, consigli a paziente/famiglia/scuola
11. Riferimenti normativi fissi (L. 170/2010 e circolari correlate) — quasi verbatim identici tra le relazioni
12. Chiusura con formula fissa di rilascio

## 2. Registro linguistico
- Terza persona, mai narrazione in prima persona
- Tono tecnico-descrittivo, mai colloquiale
- Forma impersonale per i risultati ("la prestazione risulta...", "si rileva...", "emerge...")
- Frasi introduttive standard IDENTICHE per ogni indice WISC (cambia solo il dato numerico/qualitativo del paziente, la frase-cornice resta fissa)

## 3. Formule ricorrenti (DA RIPRODURRE ESATTAMENTE)
- Apertura indice cognitivo: "L'Indice di [nome indice] (sigla) offre una misura di..."
- Transizione a conclusioni: "Alla luce di quanto emerso dalla valutazione..."
- Chiusura: "Si rilascia [ai genitori/alla famiglia] per gli usi consentiti dalla Legge"
- Riferimento normativo: citazione pressoché identica della L. 170/2010 in ogni relazione

## 4. Tabelle dei punteggi
- Le tabelle NON vengono generate dal testo libero: sono incollate così come escono dal software di scoring e riportate fedelmente, mantenendo l'allineamento originale
- Il testo narrativo commenta i punteggi ma non li ripete tutti per esteso

## 5. Terminologia preferita
| Preferita | Da evitare |
|---|---|
| "la prestazione risulta nella norma/al di sotto della norma" | "il punteggio è basso/alto" |
| "si rileva una difficoltà in..." | "ha un problema con..." |
| "il quadro neuropsicologico" | "la situazione" |
| "strumenti compensativi e misure dispensative" | "aiuti" generico |

## 6. Lunghezza e ritmo
- Relazioni complete (cognitivo + NEPSY + apprendimenti + questionari): 1300-1800 parole
- Relazioni di rivalutazione/follow-up più mirate: 700-1000 parole
- Le sezioni con tabelle hanno paragrafi narrativi brevi (3-5 frasi) subito dopo ogni tabella
`
    return { testo, relazioniUsate: usate, relazioniTotali: totali, charsCorpus }
  }

  const testo = await callGemini(
    `Sei un assistente specializzato nell'analisi dello stile di scrittura di relazioni di valutazione neuropsicologica e dell'apprendimento in età evolutiva (tipo WISC-IV, NEPSY-II, DSA/ADHD, L.170/2010).
Analizza il corpus di relazioni fornite e produci un Profilo di Stile dettagliato in formato Markdown.
Il documento deve rispettare ESATTAMENTE questa struttura, senza testo extra:

# PROFILO DI STILE — [Titolo breve]
Ultimo aggiornamento: YYYY-MM-DD | Relazioni analizzate: N | Versione: 1

## 1. Struttura standard (ORDINE INVARIABILE)
## 2. Registro linguistico
## 3. Formule ricorrenti (DA RIPRODURRE ESATTAMENTE)
## 4. Come vengono trattate le tabelle di punteggio
## 5. Terminologia preferita vs da evitare
## 6. Lunghezza e ritmo

Niente preamboli, niente frasi tipo "Il presente profilo...", niente conclusioni finali.
Mantieni il testo sintetico e operativo (massimo ~900 parole).

Contenuti obbligatori:
1. Struttura standard (ordine delle sezioni, comprese quelle ricorrenti come anamnesi, osservazione, valutazione cognitiva, approfondimento neuropsicologico, apprendimenti, questionari, conclusioni, riferimenti normativi)
2. Registro linguistico (persona, tono, costrutti grammaticali preferiti)
3. Formule ricorrenti (frasi-cornice da riprodurre esattamente, in particolare quelle che introducono ciascun indice/test)
4. Come vengono trattate le tabelle di punteggio (mai generarle da zero, sempre riportate fedelmente da un testo incollato)
5. Terminologia preferita vs da evitare (tabella)
6. Lunghezza e ritmo (indicazioni quantitative)
Non introdurre requisiti operativi non presenti nei dati di input o nel wizard (es. riferimenti obbligatori ai subtest con codici/pagine) se non sono esplicitamente disponibili.
Rispondi SOLO con il documento Markdown, senza introduzioni.`,
    `Analizza queste ${usate} relazioni di valutazione neuropsicologica e produci il Profilo di Stile.${usate < totali ? ` Nota: il corpus è stato ridotto automaticamente da ${totali} a ${usate} relazioni per limiti payload.` : ''}\n\n${corpus}`,
    {
      maxOutputTokens: 3072,
      temperature: 0.3,
      thinkingBudget: 0,
    }
  )
  return { testo, relazioniUsate: usate, relazioniTotali: totali, charsCorpus }
}

// ── GENERAZIONE RELAZIONE ──────────────────────────────────
// Strategia: la relazione viene assemblata deterministicamente da
// wizardToText.assemblaDocumentoMarkdown() invece che fare generare
// il Markdown completo a Gemini. Gemini riceve solo le sezioni
// narrative (cognitivo, nepsy, conclusioni...) mentre le tabelle
// WISC/NEPSY sono precalcolate lato client.
export async function generaNarrativaSezioni(
  profiloStile: string,
  wizard: WizardPayload,
  esempi: Relazione[] = [],
  isMock = false
): Promise<Record<string, string>> {
  const sez = wizard.sezioni_attive || []
  const out: Record<string, string> = {}

  if (isMock || USE_MOCK_AI) {
    await new Promise<void>(resolve => setTimeout(resolve, 1200))
    if (wizard.tipo_invio || wizard.motivo_invio) {
      out['intestazione'] = `Il/la paziente {{NOME}} viene inviato/a da ${wizard.tipo_invio || '[inviante]'} per ${wizard.motivo_invio || 'valutazione neuropsicologica'}.`
    }
    if (sez.includes('cognitivo') && wizard.cognitivo?.punteggi) {
      const premessa = [
        wizard.cognitivo?.eta_valutazione ? `Età al momento della valutazione: ${wizard.cognitivo.eta_valutazione}.` : '',
        wizard.cognitivo?.strumenti_utilizzati ? `Strumenti utilizzati: ${wizard.cognitivo.strumenti_utilizzati}.` : '',
      ].filter(Boolean).join(' ')
      out['cognitivo'] = [premessa, wiscToNarrativa(wizard.cognitivo.punteggi, wizard.cognitivo.subtest_pp || {})].filter(Boolean).join(' ')
    }
    if (sez.includes('nepsy') && wizard.nepsy?.punteggi) {
      const premessa = wizard.nepsy?.strumenti_utilizzati ? `Strumenti utilizzati: ${wizard.nepsy.strumenti_utilizzati}.` : ''
      out['nepsy'] = [premessa, nepsyToNarrativa(wizard.nepsy.punteggi)].filter(Boolean).join(' ')
    }
    if (sez.includes('apprendimenti') && wizard.apprendimenti) {
      const parti = [
        wizard.apprendimenti?.note_cliniche,
        wizard.apprendimenti?.lettura, wizard.apprendimenti?.scrittura, wizard.apprendimenti?.matematica,
      ].filter(Boolean)
      if (parti.length) out['apprendimenti'] = parti.join(' ')
    }
    if (sez.includes('questionari') && wizard.questionari?.note_cliniche) {
      out['questionari'] = wizard.questionari.note_cliniche
    }
    if (sez.includes('conclusioni') && wizard.conclusioni) {
      const c = wizard.conclusioni
      const parti = []
      if (c.diagnosi) parti.push(`${c.diagnosi}${c.codice_icd ? ` (${c.codice_icd})` : ''}`)
      if (c.consigli_paziente) parti.push(`Consigli: ${c.consigli_paziente}`)
      if (c.consigli_scuola) parti.push(`Indicazioni per la scuola: ${c.consigli_scuola}`)
      if (c.strumenti_compensativi) parti.push(`Strumenti compensativi: ${c.strumenti_compensativi}`)
      if (c.misure_dispensative) parti.push(`Misure dispensative: ${c.misure_dispensative}`)
      out['conclusioni'] = parti.join('\n')
    }
    return out
  }

  const wiscTabella = wizard.cognitivo?.punteggi ? wiscToMarkdownTable(wizard.cognitivo.punteggi, (wizard.cognitivo.interpretabilita as Record<string, boolean>) || {}) : ''
  const nepsyTabella = wizard.nepsy?.punteggi ? nepsyToMarkdownTable(wizard.nepsy.punteggi) : ''

  const esempiFewShot = esempi.length > 0
    ? esempi.map((e: Relazione, i: number) => `--- ESEMPIO ${i+1} ---\n${e.testo_anonimizzato || e.testo_markdown}`).join('\n\n')
    : ''

  const istruzioneLunghezza = {
    sintetica:   'Scrivi in modo SINTETICO: 2-3 frasi essenziali per sezione, dritto al punto, senza elaborazioni superflue.',
    standard:    'Scrivi con un livello di dettaglio STANDARD: una descrizione completa ma non ridondante per ciascun indice/subtest, coerente con la lunghezza media osservata nel Profilo di Stile.',
    dettagliata: 'Scrivi in modo DETTAGLIATO ED ESTESO: per ogni indice/subtest, oltre al punteggio e alla fascia, includi un\'interpretazione clinica articolata (implicazioni pratiche, confronto con altri indici quando pertinente, eventuali osservazioni qualitative). Le sezioni cognitivo e nepsy devono risultare sensibilmente più ricche rispetto a una versione standard — non limitarti a una frase per indice.',
  }[wizard.lunghezza as string] || ''

  const systemPrompt = `Sei un assistente specializzato nella redazione di relazioni di valutazione neuropsicologica e dell'apprendimento in età evolutiva.
REGOLA ASSOLUTA: scrivi ESCLUSIVAMENTE seguendo il Profilo di Stile fornito.
Non inventare mai punteggi o dati non presenti nell'input.
Genera SOLO il testo narrativo per ogni sezione richiesta. NON generare tabelle, le tabelle sono già pronte.
Usa le frasi-cornice standard del Profilo di Stile per le sezioni cognitivo e nepsy.
Per le sezioni anamnesi e osservazione: ricevi un elenco di fatti grezzi selezionati dall'utente (non una lista da riportare tale quale). Componili in prosa fluida e naturale, con la struttura sintattica e il registro osservati nel Profilo di Stile — non un elenco puntato, non una sequenza di frasi telegrafiche separate da virgole.
Per la sezione "intestazione": genera UNA sola frase iniziale che dichiara chi invia il/la paziente e per quale motivo, nello stile della frase-cornice osservata nel Profilo di Stile.
Per la sezione "cognitivo": prima di descrivere gli indici, se sono forniti età al momento della valutazione e/o strumenti utilizzati, aprine la narrazione con una breve frase che li riporta in modo discorsivo (es. "La valutazione è stata condotta all'età di 8 anni, mediante la somministrazione della scala WISC-IV.") — non elencarli come campo/valore separato.
Per la sezione "nepsy": stessa logica per gli strumenti utilizzati, integrati in una frase discorsiva a inizio sezione, non come riga a sé.
Per la sezione "apprendimenti": integra le note su lettura, scrittura e matematica fornite nella narrazione in prosa, non riportarle come frasi isolate o elenco.
Non usare mai nomi reali o dati identificativi: ovunque scriveresti il nome del/la paziente, usa esattamente il segnaposto {{NOME}} (con le doppie graffe, senza spazi interni). Non usare "il/la paziente" o altre perifrasi impersonali al posto del segnaposto: scrivi le frasi come le scriveresti con un nome vero, sostituendo solo il nome con {{NOME}} (es. "{{NOME}} accetta e porta a termine le attività proposte" invece di "il/la paziente accetta..."). Questo segnaposto verrà sostituito automaticamente con il nome reale dopo la generazione.
${istruzioneLunghezza ? `\nLIVELLO DI DETTAGLIO RICHIESTO: ${istruzioneLunghezza}\n` : ''}
Rispondi SOLO con il testo narrativo per ogni sezione, separato da intestazioni "=== SEZIONE: nome ===".

=== PROFILO DI STILE (priorità massima) ===
${profiloStile}

${esempiFewShot ? `=== ESEMPI DI RIFERIMENTO ===\n${esempiFewShot}` : ''}`

  // I campi di testo libero del wizard (note_cliniche,
  // consigli...) sono scritti direttamente da tua sorella e possono
  // contenere nomi di terzi non anticipabili — es. "su indicazione della
  // dott.ssa Martina" o "già seguito dalla Scuola X". A differenza del nome
  // del PAZIENTE (gestito col segnaposto {{NOME}}, mai inviato a Gemini),
  // qui non c'è modo di sapere a priori cosa scriverà l'utente: si applica
  // la stessa anonimizzazione euristica già usata per le relazioni
  // importate (anonimizza.ts — riconosce titoli professionali "dott./dott.
  // ssa/prof." seguiti da nome, e nomi di istituti scolastici), qui senza
  // passare l'anagrafica del paziente (non serve: quella parte la gestisce
  // già {{NOME}} a monte).
  const anon = (testo: unknown): string => {
    const s = typeof testo === 'string' ? testo : ''
    return s ? anonimizzaTesto(s, {}) : ''
  }

  const userData: string[] = []

  if (wizard.tipo_invio || wizard.motivo_invio) {
    // Non è una sezione opzionale del wizard (non compare in
    // sezioni_attive): è l'apertura fissa del documento, ma va comunque
    // generata da Gemini invece che con una frase hardcoded, per restare
    // aderente allo stile osservato nel Profilo di Stile.
    userData.push(`=== SEZIONE: intestazione ===
Tipo di invio: ${anon(wizard.tipo_invio) || 'Non specificato'}
Motivo dell'invio: ${anon(wizard.motivo_invio) || 'valutazione neuropsicologica'}`)
  }

  if (sez.includes('anamnesi') && wizard.anamnesi) {
    // Le voci checkbox selezionate vengono passate come elenco di fatti
    // grezzi (non più pre-composte in una frase telegrafica con vociToTesto,
    // che restava fuori dal Profilo di Stile — vedi wizardToText.ts).
    // Gemini le trasforma in prosa coerente col resto del documento.
    // I campi "dettagli" e "extra" sono testo libero scritto da tua sorella:
    // passano dallo stesso filtro di anonimizzazione degli altri campi.
    const anamnesi = wizard.anamnesi as UnknownRecord
    const remotaVoci = (anamnesi.remota_voci as string[] | undefined) || []
    const remotaDettagli = (anamnesi.remota_dettagli as Record<string, string> | undefined) || {}
    const recenteVoci = (anamnesi.recente_voci as string[] | undefined) || []
    const recenteDettagli = (anamnesi.recente_dettagli as Record<string, string> | undefined) || {}

    const vociRemota = remotaVoci
      .map((id: string) => {
        const voce = ANAMNESI_REMOTA_VOCI.find(v => v.id === id)
        if (!voce) return null
        const dett = remotaDettagli[id]
        return dett ? `${voce.testo} (${anon(dett)})` : voce.testo
      })
      .filter(Boolean)
    const vociRecente = recenteVoci
      .map((id: string) => {
        const voce = ANAMNESI_RECENTE_VOCI.find(v => v.id === id)
        if (!voce) return null
        const dett = recenteDettagli[id]
        return dett ? `${voce.testo} (${anon(dett)})` : voce.testo
      })
      .filter(Boolean)

    userData.push(`=== SEZIONE: anamnesi ===
Fatti anamnesi remota (da esporre in prosa fluida, non come elenco): ${vociRemota.length ? vociRemota.join('; ') : 'Nessuno'}
Dettagli aggiuntivi remota: ${anon(anamnesi.remota_extra) || 'Nessuno'}
Fatti situazione attuale/recente (da esporre in prosa fluida): ${vociRecente.length ? vociRecente.join('; ') : 'Nessuno'}
Dettagli aggiuntivi recente: ${anon(anamnesi.recente_extra) || 'Nessuno'}`)
  }

  if (sez.includes('osservazione') && wizard.osservazione) {
    const osservazione = wizard.osservazione as UnknownRecord
    const adattamentoVoci = (osservazione.adattamento_voci as string[] | undefined) || []
    const atteggiamentoVoci = (osservazione.atteggiamento_voci as string[] | undefined) || []

    const vociAdatt = adattamentoVoci
      .map((id: string) => OSSERVAZIONE_ADATTAMENTO_VOCI.find(v => v.id === id)?.testo)
      .filter(Boolean)
    const vociAtteg = atteggiamentoVoci
      .map((id: string) => OSSERVAZIONE_ATTEGGIAMENTO_VOCI.find(v => v.id === id)?.testo)
      .filter(Boolean)

    userData.push(`=== SEZIONE: osservazione ===
Fatti osservati (da esporre in prosa fluida, non come elenco): ${[...vociAdatt, ...vociAtteg].length ? [...vociAdatt, ...vociAtteg].join('; ') : 'Nessuno'}
Note aggiuntive: ${anon(osservazione.note) || 'Nessuna'}`)
  }

  if (sez.includes('cognitivo') && wizard.cognitivo?.punteggi) {
    userData.push(`=== SEZIONE: cognitivo ===
Età al momento della valutazione: ${anon(wizard.cognitivo?.eta_valutazione) || 'Non specificata'}
Strumenti utilizzati: ${anon(wizard.cognitivo?.strumenti_utilizzati) || 'Non specificati'}
Tabella WISC-IV (non modificare, verrà inserita automaticamente):
${wiscTabella}

Nota range: ${wizard.cognitivo?.includi_nota_range ? notaRangeWisc() : 'Nessuna'}
Subtest per indice (punti ponderati, media 10 DS 3 — spiegare SEMPRE a parole nel testo, MAI in tabella): ${anon(wiscSubtestPpToNarrativa(wizard.cognitivo?.subtest_pp || {})) || 'Nessuno'}
Note cliniche: ${anon(wizard.cognitivo?.note_cliniche) || 'Nessuna'}`)
  }
  if (sez.includes('nepsy') && wizard.nepsy?.punteggi) {
    userData.push(`=== SEZIONE: nepsy ===
Strumenti utilizzati: ${anon(wizard.nepsy?.strumenti_utilizzati) || 'Non specificati'}
Tabella NEPSY-II (non modificare, verrà inserita automaticamente):
${nepsyTabella}

Nota range: ${wizard.nepsy?.includi_nota_range ? notaRangeNepsy() : 'Nessuna'}
Note cliniche: ${anon(wizard.nepsy?.note_cliniche) || 'Nessuna'}`)
  }
  if (sez.includes('apprendimenti') && wizard.apprendimenti) {
    userData.push(`=== SEZIONE: apprendimenti ===
Strumenti: ${anon(wizard.apprendimenti?.strumenti) || 'Nessuno'}
Punteggi grezzi: ${wizard.apprendimenti?.punteggi_grezzi || 'Nessuno'}
Note su lettura: ${anon(wizard.apprendimenti?.lettura) || 'Nessuna'}
Note su scrittura: ${anon(wizard.apprendimenti?.scrittura) || 'Nessuna'}
Note su matematica: ${anon(wizard.apprendimenti?.matematica) || 'Nessuna'}
Note: ${anon(wizard.apprendimenti?.note_cliniche) || 'Nessuna'}`)
  }
  if (sez.includes('questionari') && wizard.questionari) {
    userData.push(`=== SEZIONE: questionari ===
Tipo: ${anon(wizard.questionari?.tipo) || 'Nessuno'}
Punteggi grezzi: ${wizard.questionari?.punteggi_grezzi || 'Nessuno'}
Note: ${anon(wizard.questionari?.note_cliniche) || 'Nessuna'}`)
  }
  if (sez.includes('conclusioni') && wizard.conclusioni) {
    const c = wizard.conclusioni
    userData.push(`=== SEZIONE: conclusioni ===
Diagnosi: ${anon(c.diagnosi) || 'Nessuna'}${c.codice_icd ? ` (${c.codice_icd})` : ''}
Consigli paziente: ${anon(c.consigli_paziente) || 'Nessuno'}
Consigli scuola: ${anon(c.consigli_scuola) || 'Nessuno'}
Strumenti compensativi: ${anon(c.strumenti_compensativi) || 'Nessuno'}
Misure dispensative: ${anon(c.misure_dispensative) || 'Nessuna'}`)
  }

  const userPrompt = `Genera SOLO il testo narrativo per ogni sezione indicata. Le tabelle sono già pronte e verranno inserite automaticamente.
Per ogni sezione, fornisci un testo fluido e coerente con il Profilo di Stile.

${userData.join('\n\n')}`

  const maxTokens = wizard.lunghezza === 'dettagliata' ? 6144 : 4096
  const risposta = await callGemini(systemPrompt, userPrompt, { maxOutputTokens: maxTokens, temperature: 0.7 })

  const sezioneRegex = /=== SEZIONE: (\w+) ===\n([\s\S]*?)(?=\n=== SEZIONE:|\n*$)/g
  const matches = risposta.matchAll(sezioneRegex)
  let numSezioniTrovate = 0
  for (const match of matches) {
    const nome = match[1]
    const testo = match[2].trim()
    if (nome && testo) { out[nome] = testo; numSezioniTrovate++ }
  }
  if (numSezioniTrovate === 0) {
    console.warn('[generaNarrativaSezioni] Parsing fallito: nessuna sezione ha rispettato il formato atteso "=== SEZIONE: nome ===". Verificare il prompt o la risposta di Gemini.')
  }

  return out
}

// ⚠️ SICUREZZA DATI: `wizard.anagrafica` viene DELIBERATAMENTE
// rimosso dal payload prima di costruire qualunque prompt o chiamata
// a Gemini. Quei dati vengono ricomposti nel documento finale solo
// lato client, in RisultatoGenerazione.tsx + exportDocx.ts, mai visti
// dall'AI.
export async function generaRelazione(profiloStile: string, wizardCompleto: WizardPayload, esempi: Relazione[] = []): Promise<string> {
  const { anagrafica: _anagrafica, ...wizard } = wizardCompleto

  if (USE_MOCK_AI) {
    await new Promise<void>(resolve => setTimeout(resolve, 2200))
    const narrativa = await generaNarrativaSezioni('', wizard, [], true)
    return assemblaDocumentoMarkdown(wizard, narrativa)
  }

  const narrativa = await generaNarrativaSezioni(profiloStile, wizard, esempi, false)
  return assemblaDocumentoMarkdown(wizard, narrativa)
}

// ── RIGENERA SEZIONE ───────────────────────────────────────
export async function rigeneraSezione(profiloStile: string, sezione: string, testo: string, istruzione: string): Promise<string> {
  if (USE_MOCK_AI) {
    await new Promise<void>(resolve => setTimeout(resolve, 1200))
    return testo + '\n\n*[Sezione rigenerata con istruzione: ' + istruzione + ']*'
  }

  return callGemini(
    `Sei un assistente specializzato nella redazione di relazioni di valutazione neuropsicologica.
Riscrivi SOLO la sezione fornita, seguendo il Profilo di Stile. Se la sezione contiene una tabella di punteggi, NON modificarla: riportala identica e riscrivi solo il commento narrativo attorno.
Rispondi SOLO con il testo della sezione riscritta, senza intestazioni aggiuntive.

=== PROFILO DI STILE ===
${profiloStile}`,
    `Sezione da riscrivere: "${sezione}"

Testo attuale:
${testo}

Istruzione aggiuntiva: ${istruzione}`
  )
}

// ── AGGIORNAMENTO INCREMENTALE PROFILO ────────────────────
// Invece di rianalizzare tutto il corpus, integra il profilo
// esistente con le sole relazioni nuove (aggiunte dopo l'ultimo
// aggiornamento). Molto più efficiente con Gemini gratuito.
export async function aggiornaProfiloIncrementale(profiloEsistente: string, nuoveRelazioni: Relazione[]): Promise<AiResult> {
  const relazioniAnonimizzate = await anonimizzaRelazioniPerAnalisi(nuoveRelazioni)
  const { corpus, usate, totali, charsCorpus } = costruisciCorpus(relazioniAnonimizzate, 'NUOVA RELAZIONE')

  if (USE_MOCK_AI) {
    await new Promise<void>(resolve => setTimeout(resolve, 1400))
    // In mock: aggiunge solo una riga di nota in fondo al profilo
    const dataNow = new Date().toISOString().slice(0, 10)
    const testo = profiloEsistente
      .replace(/Relazioni analizzate: \d+/, `Relazioni analizzate: ${profiloEsistente.match(/Relazioni analizzate: (\d+)/)?.[1] ?? '?'} + ${relazioniAnonimizzate.length} nuove`)
      .replace(/Ultimo aggiornamento: [\d-]+/, `Ultimo aggiornamento: ${dataNow}`)
      + `\n\n> *Aggiornamento incrementale del ${dataNow}: analizzate ${relazioniAnonimizzate.length} nuove relazioni. Nessuna modifica sostanziale rilevata rispetto al profilo precedente (demo).*`
    return { testo, relazioniUsate: usate, relazioniTotali: totali, charsCorpus }
  }

  const testo = await callGemini(
    `Sei un assistente specializzato nell'analisi dello stile di scrittura di relazioni di valutazione neuropsicologica.
Hai già un Profilo di Stile esistente. Vengono aggiunte nuove relazioni al corpus.
Il tuo compito è AGGIORNARE il profilo integrando eventuali pattern nuovi o correggendo quelli già presenti.
NON riscrivere il profilo da zero: parti da quello esistente e modifica solo ciò che cambia.
Se le nuove relazioni confermano il profilo senza aggiungere nulla di nuovo, rispondi con il profilo invariato.
Aggiorna la riga "Ultimo aggiornamento" e "Relazioni analizzate" in cima al documento.
Rispondi SOLO con il documento Markdown aggiornato, senza introduzioni.`,
    `=== PROFILO DI STILE ATTUALE ===
${profiloEsistente}

=== NUOVE RELAZIONI DA INTEGRARE (${usate}${usate < totali ? ` di ${totali}, corpus ridotto automaticamente` : ''}) ===
${corpus}

Aggiorna il profilo integrando le osservazioni dalle nuove relazioni.`
  )
  return { testo, relazioniUsate: usate, relazioniTotali: totali, charsCorpus }
}

export { USE_MOCK_AI }
