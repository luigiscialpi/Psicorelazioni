// ============================================================
// GEMINI SERVICE — chiama l'API o restituisce output mock
// Calibrato sulla struttura reale di relazioni di valutazione
// neuropsicologica/apprendimento (WISC-IV, NEPSY-II, CBCL/YSR...),
// identificata analizzando 3 relazioni reali (lette privatamente,
// mai usate come contenuto — solo per ricavarne lo scheletro).
// ============================================================

import {
  wiscToMarkdownTable, nepsyToMarkdownTable, assemblaDocumentoMarkdown,
} from './wizardToText'
import { buildGeminiPayload, calcolaNarrativaGruppi } from './testTemplateEngine'
import { MOCK_WISC_IV_TEMPLATE, MOCK_NEPSY_II_TEMPLATE } from '../data/mockTemplates'
import type { RisultatoTest, TestTemplate } from '../core/testTemplate'
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
  anagrafica?: { genere?: string } & UnknownRecord
  sezioni_attive?: string[]
  tipo_invio?: string
  motivo_invio?: string
  nome_inviante?: string
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
const USE_MOCK_AI = !API_KEY || API_KEY === 'YOUR_GEMINI_KEY' || (typeof process !== 'undefined' && process.env.NODE_ENV === 'test')

// Fallback predefinito basato sui modelli testuali comunemente disponibili nel piano senza costi.
// Nota: la disponibilita reale dipende sempre da progetto, quota e stato account in AI Studio.
const DEFAULT_FREE_MODEL_FALLBACK = [
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
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
  const result = await callGeminiWithFinishReason(systemPrompt, userPrompt, options)
  return result.text
}

async function callGeminiWithFinishReason(systemPrompt: string, userPrompt: string, options: GeminiCallOptions = {}): Promise<{ text: string; finishReason?: string }> {
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
        const finishReason = candidate?.finishReason

        if (finishReason === 'MAX_TOKENS') {
          console.warn(`Gemini response truncated [${modelName}] per limite token output.`)
          return { text, finishReason: 'MAX_TOKENS' }
        }

        return { text, finishReason }
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

// Continuazione specifica per una sezione troncata
async function continuaSezione(
  systemPrompt: string,
  sezioneParziale: string,
  sezioneName: string,
  options: GeminiCallOptions = {}
): Promise<string> {
  const { maxOutputTokens = 4096, temperature = 0.7, thinkingBudget = 0 } = options

  const continuationPrompt = `Questo è ciò che hai generato finora della ${sezioneName}:

\`\`\`
${sezioneParziale}
\`\`\`

La generazione è stata interrotta a causa di limiti di token. Completa la ${sezioneName} proseguendo ESATTAMENTE da dove ti sei fermato, senza ripetere alcun testo già presente sopra. Se la sezione è già completa, rispondi solo con "COMPLETA". Altrimenti, continua il testo.`

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: continuationPrompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget },
    },
  }

  for (let modelIndex = 0; modelIndex < MODEL_CANDIDATES.length; modelIndex++) {
    const modelName = MODEL_CANDIDATES[modelIndex]
    const endpoint = buildEndpoint(modelName)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      let data: GeminiResponse | null = null
      try {
        data = await res.json() as GeminiResponse
      } catch {
        continue
      }

      if (res.ok) {
        let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        
        if (text === 'COMPLETA' || text.trim() === 'COMPLETA') {
          // Sezione già completa, non aggiungere nulla
          return ''
        }

        // Ripulisci markdown fence accidentali
        text = text.replace(/^```\n?/, '').replace(/\n?```$/, '').trim()
        
        return text
      }
    } catch {
      continue
    }
  }

  return '' // Se continua fallisce, ritorna vuoto
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

## 7. Analisi dei Test Clinici Rilevati nell'Archivio
Qui sono descritti i test clinici identificati nelle relazioni, con le relative colonne di scoring, subtest e commenti tipici usati dal clinico:

### Test: BVSCO-2 (Batteria per la Valutazione della Scrittura e della Competenza Ortografica)
- **Categoria**: apprendimenti
- **Struttura Colonne**: Subtest, Punteggio Grezzo, Percentile, Fascia di Prestazione (es. "Richiesta di Intervento", "Attenzione", "Sufficiente", "Ottimale")
- **Campi e Subtest**:
  - Dettato di brano (competenze ortografiche generali)
  - Scrittura di parole (ortografia lessicale)
  - Scrittura di non-parole (via fonologica)
  - Velocità di scrittura (fluenza grafo-motoria)
- **Commenti e Note Range**:
  - *Nota range*: *BVSCO-2: percentili <5° indicano Richiesta di Intervento (deficit ortografico), tra 5° e 15° indicano Attenzione, >15° indicano prestazione Sufficiente/Sopra la media.*
  - *Commenti qualitativi*: descrive tipicamente il tipo di errore (fonologico vs non fonologico) e la velocità di esecuzione.

### Test: MT-3 (Prove di Lettura MT per la Scuola Primaria e Secondaria)
- **Categoria**: apprendimenti
- **Struttura Colonne**: Prova, Tempo (secondi), Sillabe/Secondo, Errori, Percentile, Fascia di Prestazione
- **Campi e Subtest**:
  - Lettura di brano - Correttezza (numero di errori commessi)
  - Lettura di brano - Rapidità (sillabe al secondo lette)
  - Comprensione del testo (domande a risposta multipla con testo a disposizione)
- **Commenti e Note Range**:
  - *Nota range*: *Prove MT-3: prestazioni valutate su 4 fasce cliniche: Richiesta di Intervento Immediato (RII, <5° percentile), Richiesta di Attenzione (RA, 5°-15° percentile), Prestazione Sufficiente (PS, 15°-80° percentile), Criterio Completamente Raggiunto (CCR, >80° percentile).*
  - *Commenti qualitativi*: analizza il ritmo di lettura, le esitazioni, le autocorrezioni e la tipologia di errori (sostituzioni, omissioni).
`
    return { testo, relazioniUsate: usate, relazioniTotali: totali, charsCorpus }
  }

  // Call 1: Analisi dello stile di scrittura (Sezioni 1-6)
  const promptStileSystem = `Sei un assistente specializzato nell'analisi dello stile di scrittura di relazioni di valutazione neuropsicologica e dell'apprendimento in età evolutiva (tipo WISC-IV, NEPSY-II, DSA/ADHD, L.170/2010).
Analizza il corpus di relazioni fornite e produci un Profilo di Stile dettagliato in formato Markdown.
Il documento deve rispettare ESATTAMENTE questa struttura (sezioni 1-6), senza testo extra:

# PROFILO DI STILE — [Titolo breve]
Ultimo aggiornamento: YYYY-MM-DD | Relazioni analizzate: N | Versione: 1

## 1. Struttura standard (ORDINE INVARIABILE)
## 2. Registro linguistico
## 3. Formule ricorrenti (DA RIPRODURRE ESATTAMENTE)
## 4. Come vengono trattate le tabelle di punteggio
## 5. Terminologia preferita vs da evitare
## 6. Lunghezza e ritmo

Sii estremamente dettagliato ed esaustivo nell'analisi dello stile di scrittura delle relazioni. Fornisci regole ed esempi pratici tratti dalle relazioni per ciascuna sezione.
In particolare, per ciascun test clinico nella 'Struttura standard', analizza e documenta se l'analisi narrativa segue la regola di esporre prima il risultato globale/finale (es. QIT, IAG, ICC per la WISC-IV, o il punteggio totale del test) e solo successivamente i singoli indici o subtest secondari, documentando questo pattern in modo esplicito.
Rispondi SOLO con il documento Markdown delle sezioni 1-6, senza introduzioni.`

  const testoStile = await callGemini(
    promptStileSystem,
    `Analizza queste ${usate} relazioni di valutazione neuropsicologica e produci il Profilo di Stile (sezioni 1-6).\n\n${corpus}`,
    {
      maxOutputTokens: 8192,
      temperature: 0.3,
      thinkingBudget: 0,
    }
  )

  // Call 2: Estrazione della struttura dei Test Clinici (Sezione 7) - con verifica troncamento
  const promptTestSystem = `Sei un assistente clinico specializzato nella catalogazione e analisi dei test neuropsicologici e psicometrici citati in relazioni cliniche.
Analizza il corpus di relazioni fornite e produci un documento in formato Markdown che descrive dettagliatamente tutti i test clinici o batterie individuate nelle relazioni (escludendo WISC-IV e NEPSY-II).
Il documento deve rispettare ESATTAMENTE questa struttura, senza testo extra:

## 7. Analisi dei Test Clinici Rilevati nell'Archivio
Qui sono descritti i test clinici identificati nelle relazioni, con le relative colonne di scoring delle tabelle, subtest e commenti tipici usati dal clinico.

Per ciascun test o batteria individuato, crea una sottosezione:
### Test: [Nome del Test] (es. BVSCO-2)
- **Categoria**: [categoria clinica tra: cognitivo, nepsy, apprendimenti, questionari, altro]
- **Struttura Colonne**: [le colonne presenti nelle tabelle di scoring di questo test, es. Punteggio Grezzo, Percentile, Fascia di prestazione. Fai attenzione a specificare tutte le colonne reali viste in tabella]
- **Campi e Subtest**: [elenco degli indici primari e dei subtest secondari che compongono il test]
- **Commenti e Note Range**:
  - *Nota range*: [le note metodologiche sulle fasce di punteggio o i cut-off usati, es. <5° percentile come deficit]
  - *Commenti qualitativi*: [descrizione del comportamento, degli errori tipici o dei commenti qualitativi commentati nella relazione per questo test]

Sii estremamente preciso ed esaustivo nell'estrarre le colonne, i subtest e le note di range.
Rispondi SOLO con la sezione 7 in formato Markdown, senza introduzioni.`

  const resultTest = await callGeminiWithFinishReason(
    promptTestSystem,
    `Analizza queste ${usate} relazioni di valutazione neuropsicologica ed estrai l'analisi dei test clinici (sezione 7).\n\n${corpus}`,
    {
      maxOutputTokens: 8192,
      temperature: 0.2,
      thinkingBudget: 0,
    }
  )

  let testoTestCompleto = resultTest.text

  // Se la sezione 7 è stata troncata, prova a completarla
  if (resultTest.finishReason === 'MAX_TOKENS') {
    console.log('Sezione 7 troncata (MAX_TOKENS) — tentativo di continuazione...')
    const continuazione = await continuaSezione(
      promptTestSystem,
      resultTest.text,
      'Sezione 7 - Analisi dei Test Clinici',
      { maxOutputTokens: 8192, temperature: 0.2, thinkingBudget: 0 }
    )
    if (continuazione) {
      testoTestCompleto = `${resultTest.text}\n\n${continuazione}`
    }
  }

  const testo = `${testoStile.trim()}\n\n${testoTestCompleto.trim()}`
  return { testo, relazioniUsate: usate, relazioniTotali: totali, charsCorpus }
}

// ── GENERAZIONE RELAZIONE ──────────────────────────────────
// Strategia: la relazione viene assemblata deterministicamente da
// wizardToText.assemblaDocumentoMarkdown() invece che fare generare
// il Markdown completo a Gemini. Gemini riceve solo le sezioni
// narrative (cognitivo, nepsy, conclusioni...) mentre le tabelle
// WISC/NEPSY sono precalcolate lato client.
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
  isMock = false,
  templatesDinamici: TestTemplate[] = []
): Promise<Record<string, string>> {
  const sez = wizard.sezioni_attive || []
  const out: Record<string, string> = {}

  if (isMock || USE_MOCK_AI) {
    await new Promise<void>(resolve => setTimeout(resolve, 1200))
    if (wizard.tipo_invio || wizard.motivo_invio || wizard.nome_inviante) {
      const chiInvia = [wizard.nome_inviante, wizard.tipo_invio].filter(Boolean).join(', ') || '[inviante]'
      out['intestazione'] = `Il/la paziente {{NOME}} viene inviato/a da ${chiInvia} per ${wizard.motivo_invio || 'valutazione neuropsicologica'}.`
    }
    if (sez.includes('cognitivo') && wizard.cognitivo?.punteggi) {
      const cleanPunteggi = (p: ScoreMap | undefined): Record<string, string | number> => {
        const cleaned: Record<string, string | number> = {}
        if (!p) return cleaned
        for (const [k, v] of Object.entries(p)) {
          if (typeof v === 'string' || typeof v === 'number') {
            cleaned[k] = v
          }
        }
        return cleaned
      }

      const ris: RisultatoTest = {
        somministrato: true,
        punteggi: cleanPunteggi(wizard.cognitivo.punteggi),
        punteggiSecondari: cleanPunteggi(wizard.cognitivo.subtest_pp),
      }
      const premessa = [
        wizard.cognitivo?.eta_valutazione ? `Età al momento della valutazione: ${wizard.cognitivo.eta_valutazione}.` : '',
        wizard.cognitivo?.strumenti_utilizzati ? `Strumenti utilizzati: ${wizard.cognitivo.strumenti_utilizzati}.` : '',
      ].filter(Boolean).join(' ')
      // For mock output, we just generate something simple.
      out['cognitivo'] = [premessa, 'I risultati del test cognitivo sono riportati nella tabella corrispondente.'].filter(Boolean).join(' ')
    }
    if (sez.includes('nepsy') && wizard.nepsy?.punteggi) {
      const premessa = wizard.nepsy?.strumenti_utilizzati ? `Strumenti utilizzati: ${wizard.nepsy.strumenti_utilizzati}.` : ''
      out['nepsy'] = [premessa, 'I risultati dell\'approfondimento neuropsicologico sono riportati nella tabella corrispondente.'].filter(Boolean).join(' ')
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

  const generePaziente = (wizard.anagrafica as any)?.genere || ''
  const istruzioneGenere = generePaziente === 'maschio'
    ? 'Il/la paziente è un MASCHIO: usa sempre il maschile per i pronomi e le concordanze grammaticali relative alla persona valutata (es. "è stato valutato", "ha mostrato", "il bambino").'
    : generePaziente === 'femmina'
      ? 'Il/la paziente è una FEMMINA: usa sempre il femminile per i pronomi e le concordanze grammaticali relative alla persona valutata (es. "è stata valutata", "ha mostrato", "la bambina").'
      : 'Il genere del/la paziente non è specificato: usa forme neutre o la barra (es. "il/la paziente") quando necessario.'

  const baseSystemPrompt = `Sei un assistente specializzato nella redazione di relazioni di valutazione neuropsicologica e dell'apprendimento in età evolutiva.
REGOLA ASSOLUTA: scrivi ESCLUSIVAMENTE seguendo il Profilo di Stile fornito.
Non inventare mai punteggi o dati non presenti nell'input.
Genera SOLO il testo narrativo per ogni sezione richiesta. NON generare tabelle, le tabelle sono già pronte.
Usa le frasi-cornice standard del Profilo di Stile per le sezioni cognitivo e nepsy.
Per le sezioni anamnesi e osservazione: ricevi un elenco di fatti grezzi selezionati dall'utente (non una lista da riportare tale quale). Componili in prosa fluida e naturale, con la struttura sintattica e il registro osservati nel Profilo di Stile — non un elenco puntato, non una sequenza di frasi telegrafiche separate da virgole.
Per la sezione "intestazione": genera UNA sola frase iniziale che dichiara chi invia il/la paziente e per quale motivo, nello stile della frase-cornice osservata nel Profilo di Stile. Se è indicato un nome di chi invia, citalo per esteso nella frase (es. "su segnalazione della Dott.ssa Maria Rossi, neuropsichiatra infantile...") — non ometterlo e non sostituirlo con una perifrasi generica.
Per la sezione "cognitivo": prima di descrivere gli indici, se sono forniti età al momento della valutazione e/o strumenti utilizzati, aprine la narrazione con una breve frase che li riporta in modo discorsivo (es. "La valutazione è stata condotta all'età di 8 anni, mediante la somministrazione della scala WISC-IV.") — non elencarli come campo/valore separato.
Per la sezione "nepsy": stessa logica per gli strumenti utilizzati, integrati in una frase discorsiva a inizio sezione, non come riga a sé.
Per la sezione "apprendimenti": integra le note su lettura, scrittura e matematica fornite nella narrazione in prosa, non riportarle come frasi isolate o elenco.
Non usare mai nomi reali o dati identificativi: ovunque scriveresti il nome del/la paziente, usa esattamente il segnaposto {{NOME}} (con le doppie graffe, senza spazi interni). Non usare "il/la paziente" o altre perifrasi impersonali al posto del segnaposto: scrivi le frasi come le scriveresti con un nome vero, sostituendo solo il nome con {{NOME}} (es. "{{NOME}} accetta e porta a termine le attività proposte" invece di "il/la paziente accetta..."). Questo segnaposto verra sostituito automaticamente con il nome reale dopo la generazione.
ORDINE DI ANALISI NEI TEST: Per la narrativa di qualsiasi test clinico (es. cognitivo, nepsy, questionari, ecc.), esponi sempre prima il risultato globale/finale (es. QIT/IAG/ICC per la WISC-IV, o il punteggio totale del test) e solo successivamente procedi con l'analisi dettagliata dei singoli indici o subtest secondari. Questo ordine dal generale al particolare è tassativo.
STRUTTURA E SUDDIVISIONE NARRATIVA SEZIONI CON SOTTOTEST/GRUPPI CONDIVISI O COMPLESSI:
Se una sezione di un test clinico contiene gruppi o sottotest secondari (ad esempio i questionari CBCL con "Scale Sindromiche" e "Scale DSM Oriented", o la WISC-IV con i vari indici), non formattare mai il testo come un unico blocco narrativo omogeneo. 
Spezza e suddividi esplicitamente la narrativa inserendo i tag di sottosezione corrispondenti (es. "=== SOTTOSEZIONE: Scale Sindromiche ===" prima di analizzare i subtest sindromici, o "=== SOTTOSEZIONE: Scale DSM Oriented ===" prima dell'analisi DSM). Questo permetterà di inserire e posizionare ciascuna parte di testo direttamente sotto la corrispettiva tabella.
CONCORDANZA GRAMMATICALE: ${istruzioneGenere}
${istruzioneLunghezza ? `\nLIVELLO DI DETTAGLIO RICHIESTO: ${istruzioneLunghezza}\n` : ''}
Rispondi SOLO con il testo narrativo per ogni sezione richiesta del blocco, separato esattamente da intestazioni "=== SEZIONE: nome ===". Non includere altre sezioni oltre a quelle richieste.

=== PROFILO DI STILE (priorità massima) ===
${profiloStile}

${esempiFewShot ? `=== ESEMPI DI RIFERIMENTO ===\n${esempiFewShot}` : ''}`

  const anon = (testo: unknown): string => {
    const s = typeof testo === 'string' ? testo : ''
    return s ? anonimizzaTesto(s, {}) : ''
  }

  // 1. Costruiamo TUTTI i payload teoricamente disponibili
  const tuttiPayloads: Record<string, string> = {}

  if (wizard.tipo_invio || wizard.motivo_invio || wizard.nome_inviante) {
    tuttiPayloads['intestazione'] = `=== SEZIONE: intestazione ===
Tipo di invio: ${anon(wizard.tipo_invio) || 'Non specificato'}
Nome di chi invia (se presente, va citato per esteso nella frase, es. "su segnalazione della Dott.ssa Rossi..."): ${wizard.nome_inviante || 'Non specificato'}
Motivo dell'invio: ${anon(wizard.motivo_invio) || 'valutazione neuropsicologica'}`
  }

  if (sez.includes('anamnesi') && wizard.anamnesi) {
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

    tuttiPayloads['anamnesi'] = `=== SEZIONE: anamnesi ===
Fatti anamnesi remota (da esporre in prosa fluida, non come elenco): ${vociRemota.length ? vociRemota.join('; ') : 'Nessuno'}
Dettagli aggiuntivi remota: ${anon(anamnesi.remota_extra) || 'Nessuno'}
Fatti situazione attuale/recente (da esporre in prosa fluida): ${vociRecente.length ? vociRecente.join('; ') : 'Nessuno'}
Dettagli aggiuntivi recente: ${anon(anamnesi.recente_extra) || 'Nessuno'}`
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

    tuttiPayloads['osservazione'] = `=== SEZIONE: osservazione ===
Fatti osservati (da esporre in prosa fluida, non come elenco): ${[...vociAdatt, ...vociAtteg].length ? [...vociAdatt, ...vociAtteg].join('; ') : 'Nessuno'}
Note aggiuntive: ${anon(osservazione.note) || 'Nessuna'}`
  }

  if (sez.includes('cognitivo') && wizard.cognitivo?.punteggi) {
    const cleanP = (p: any): Record<string, string | number> => {
      const res: Record<string, string | number> = {}
      if (!p) return res
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === 'string' || typeof v === 'number') {
          res[k] = v
        }
      }
      return res
    }

    const cleanInterp = (p: any): Record<string, boolean> => {
      const res: Record<string, boolean> = {}
      if (!p) return res
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === 'boolean') {
          res[k] = v
        }
      }
      return res
    }

    const ris: RisultatoTest = {
      somministrato: true,
      punteggi: cleanP(wizard.cognitivo?.punteggi),
      punteggiSecondari: cleanP(wizard.cognitivo?.subtest_pp),
      interpretabilita: cleanInterp(wizard.cognitivo?.interpretabilita),
      includiNotaRange: wizard.cognitivo?.includi_nota_range !== false,
      etaValutazione: wizard.cognitivo?.eta_valutazione as string | undefined,
      strumentiUtilizzati: wizard.cognitivo?.strumenti_utilizzati as string | undefined,
      noteCliniche: wizard.cognitivo?.note_cliniche as string | undefined
    }
    tuttiPayloads['cognitivo'] = buildGeminiPayload(MOCK_WISC_IV_TEMPLATE, ris)
  }

  if (sez.includes('nepsy') && wizard.nepsy?.punteggi) {
    const cleanP = (p: any): Record<string, string | number> => {
      const res: Record<string, string | number> = {}
      if (!p) return res
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === 'string' || typeof v === 'number') {
          res[k] = v
        }
      }
      return res
    }

    const ris: RisultatoTest = {
      somministrato: true,
      punteggi: cleanP(wizard.nepsy?.punteggi),
      includiNotaRange: wizard.nepsy?.includi_nota_range !== false,
      strumentiUtilizzati: wizard.nepsy?.strumenti_utilizzati as string | undefined,
      noteCliniche: wizard.nepsy?.note_cliniche as string | undefined
    }
    tuttiPayloads['nepsy'] = buildGeminiPayload(MOCK_NEPSY_II_TEMPLATE, ris)
  }

  if (sez.includes('apprendimenti') && wizard.apprendimenti) {
    tuttiPayloads['apprendimenti'] = `=== SEZIONE: apprendimenti ===
Strumenti: ${anon(wizard.apprendimenti?.strumenti) || 'Nessuno'}
Punteggi grezzi: ${wizard.apprendimenti?.punteggi_grezzi || 'Nessuno'}
Note su lettura: ${anon(wizard.apprendimenti?.lettura) || 'Nessuna'}
Note su scrittura: ${anon(wizard.apprendimenti?.scrittura) || 'Nessuna'}
Note su matematica: ${anon(wizard.apprendimenti?.matematica) || 'Nessuna'}
Note: ${anon(wizard.apprendimenti?.note_cliniche) || 'Nessuna'}`
  }

  if (sez.includes('questionari') && wizard.questionari) {
    tuttiPayloads['questionari'] = `=== SEZIONE: questionari ===
Tipo: ${anon(wizard.questionari?.tipo) || 'Nessuno'}
Punteggi grezzi: ${wizard.questionari?.punteggi_grezzi || 'Nessuno'}
Note: ${anon(wizard.questionari?.note_cliniche) || 'Nessuna'}`
  }

  if (sez.includes('conclusioni') && wizard.conclusioni) {
    const c = wizard.conclusioni
    tuttiPayloads['conclusioni'] = `=== SEZIONE: conclusioni ===
Diagnosi: ${anon(c.diagnosi) || 'Nessuna'}${c.codice_icd ? ` (${c.codice_icd})` : ''}
Consigli paziente: ${anon(c.consigli_paziente) || 'Nessuno'}
Consigli scuola: ${anon(c.consigli_scuola) || 'Nessuno'}
Strumenti compensativi: ${anon(c.strumenti_compensativi) || 'Nessuno'}
Misure dispensative: ${anon(c.misure_dispensative) || 'Nessuna'}`
  }

  // 1b. Inseriamo i payload per i template dinamici
  for (const sezId of sez) {
    const template = templatesDinamici.find(t => t.id === sezId)
    const risultato: RisultatoTest | undefined = wizard.test_risultati?.[sezId]
    if (template && risultato?.somministrato) {
      tuttiPayloads[sezId] = buildGeminiPayload(template, risultato)
    }
  }

  // 2. Suddividiamo le sezioni attive in blocchi di massimo 3 sezioni ciascuno
  const sezioniSelezionate = Object.keys(tuttiPayloads)
  const blocchi: string[][] = []

  for (let i = 0; i < sezioniSelezionate.length; i += 3) {
    blocchi.push(sezioniSelezionate.slice(i, i + 3))
  }

  console.log(`[generaNarrativaSezioni] Suddivisa generazione in ${blocchi.length} blocchi di chiamate da max 3 sezioni ciasuna`, blocchi)

  // 3. Eseguiamo le chiamate per ciascun blocco
  for (const blocco of blocchi) {
    const blockPayload = blocco.map(secName => tuttiPayloads[secName]).join('\n\n')
    const userPrompt = `Genera SOLO il testo narrativo per le sezioni di QUESTO specifico blocco: ${blocco.join(', ')}. Le tabelle sono già pronte e verranno inserite automaticamente.
Per ogni sezione del blocco, fornisci un testo fluido e coerente con il Profilo di Stile.

${blockPayload}`

    const maxTokens = wizard.lunghezza === 'dettagliata' ? 4096 : 3072
    console.log(`[generaNarrativaSezioni] Chiamata Gemini per il blocco: ${blocco.join(', ')}...`)
    const risposta = await callGemini(baseSystemPrompt, userPrompt, { maxOutputTokens: maxTokens, temperature: 0.7 })

    const sezioneRegex = /=== SEZIONE: ([\w-]+) ===\n([\s\S]*?)(?=\n=== SEZIONE:|\n*$)/g
    const matches = risposta.matchAll(sezioneRegex)
    let numSezioniTrovate = 0

    for (const match of matches) {
      const nome = match[1]
      const testo = match[2].trim()
      if (nome && blocco.includes(nome) && testo) {
        out[nome] = testo
        numSezioniTrovate++
      }
    }

    if (numSezioniTrovate < blocco.length) {
      console.warn(`[generaNarrativaSezioni] Chiamata blocco [${blocco.join(', ')}]: trovate solo ${numSezioniTrovate}/${blocco.length} sezioni. Tento fallback regex più lasco per le sezioni mancanti.`)
      // Fallback: se Gemini ha fluttuato sui tag ma li ha scritti comunque
      for (const nome of blocco) {
        if (!out[nome]) {
          const fallbackRegex = new RegExp(`===\\s*SEZIONE:\\s*${nome}\\s*===\n([\\s\\S]*?)(?=\\n===\\s*SEZIONE:|\\n*$)`, 'i')
          const fMatch = risposta.match(fallbackRegex)
          if (fMatch && fMatch[1].trim()) {
            out[nome] = fMatch[1].trim()
            console.log(`[generaNarrativaSezioni] Fallback riuscito per sezione: ${nome}`)
          }
        }
      }
    }
  }

  return out
}

// ⚠️ SICUREZZA DATI: `wizard.anagrafica` viene DELIBERATAMENTE
// rimosso dal payload prima di costruire qualunque prompt o chiamata
// a Gemini. Quei dati vengono ricomposti nel documento finale solo
// lato client, in RisultatoGenerazione.tsx + exportDocx.ts, mai visti
// dall'AI.
// NOTA: Conserviamo però il genere della persona (es. per accordo pronomi)
// estraendolo prima di rimuovere il resto delle informazioni identificative,
// così l'AI riceve l'istruzione sul genere ma non nome, cognome ecc.
export async function generaRelazione(
  profiloStile: string,
  wizardCompleto: WizardPayload,
  esempi: Relazione[] = [],
  templatesDinamici: TestTemplate[] = []
): Promise<string> {
  const { anagrafica, ...wizard } = wizardCompleto

  // Lasciamo solo genere in wizard.anagrafica in modo che generaNarrativaSezioni possa leggerlo
  const wizardPrivato = {
    ...wizard,
    anagrafica: anagrafica?.genere ? { genere: anagrafica.genere } : undefined
  }

  if (USE_MOCK_AI) {
    await new Promise<void>(resolve => setTimeout(resolve, 2200))
    const narrativa = await generaNarrativaSezioni('', wizardPrivato, [], true, templatesDinamici)
    return assemblaDocumentoMarkdown(wizardCompleto, narrativa, templatesDinamici)
  }

  const narrativa = await generaNarrativaSezioni(profiloStile, wizardPrivato, esempi, false, templatesDinamici)
  return assemblaDocumentoMarkdown(wizardCompleto, narrativa, templatesDinamici)
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

function splitProfilo(profilo: string): { stile: string; test: string } {
  const marker = '## 7. Analisi dei Test Clinici'
  const idx = profilo.indexOf(marker)
  if (idx === -1) {
    return {
      stile: profilo.trim(),
      test: `## 7. Analisi dei Test Clinici Rilevati nell'Archivio\nQui sono descritti i test clinici identificati nelle relazioni, con le relative colonne di scoring delle tabelle, subtest e commenti tipici usati dal clinico.`
    }
  }
  return {
    stile: profilo.slice(0, idx).trim(),
    test: profilo.slice(idx).trim()
  }
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

  const { stile, test } = splitProfilo(profiloEsistente)

  // Call 1: Aggiornamento stile scrittura (Sezioni 1-6)
  const nuovoStile = await callGemini(
    `Sei un assistente specializzato nell'analisi dello stile di scrittura di relazioni di valutazione neuropsicologica.
Hai già un Profilo di Stile esistente (sezioni da 1 a 6). Vengono aggiunte nuove relazioni al corpus.
Il tuo compito è AGGIORNARE il profilo integrando eventuali pattern nuovi o correggendo quelli già presenti.
NON riscrivere il profilo da zero: parti da quello esistente e modifica solo ciò che cambia nelle sezioni da 1 a 6.
Sii estremamente dettagliato ed esaustivo nell'analisi.
In particolare, verifica e documenta se l'analisi narrativa dei test clinici segue la regola di esporre prima il risultato globale/finale e solo successivamente i singoli indici o subtest secondari.
Se le nuove relazioni confermano il profilo senza aggiungere nulla di nuovo, rispondi con il profilo invariato.
Aggiorna la riga "Ultimo aggiornamento" e "Relazioni analizzate" in cima al documento.
Rispondi SOLO con il documento Markdown aggiornato (sezioni 1-6), senza introduzioni.`,
    `=== PROFILO DI STILE ATTUALE (SEZIONI 1-6) ===
${stile}

=== NUOVE RELAZIONI DA INTEGRARE ===
${corpus}

Aggiorna il profilo per le sezioni 1-6.`,
    {
      maxOutputTokens: 8192,
      temperature: 0.3,
      thinkingBudget: 0,
    }
  )

  // Call 2: Aggiornamento struttura test (Sezione 7)
  const nuoviTest = await callGemini(
    `Sei un assistente clinico specializzato nella catalogazione e analisi dei test neuropsicologici e psicometrici in relazioni cliniche.
Hai una sezione esistente con l'analisi dei test rilevati nell'archivio.
Il tuo compito è AGGIORNARE questa sezione integrando i dettagli di eventuali nuovi test clinici o subtest individuati nelle relazioni aggiunte (escludendo WISC-IV e NEPSY-II).
Per ciascun test mantieni o aggiorna la struttura:
- Nome del test e Categoria clinica.
- Struttura Colonne (le colonne presenti nelle tabelle di scoring).
- Campi e Subtest (indici primari e subtest).
- Commenti e Note Range (soglie, cut-off, commenti qualitativi).
Se i test nelle nuove relazioni sono già descritti accuratamente nella sezione esistente, rispondi con il testo esistente invariato.
Rispondi SOLO con la sezione 7 in formato Markdown, senza introduzioni.`,
    `=== ANALISI TEST ESISTENTE (SEZIONE 7) ===
${test}

=== NUOVE RELAZIONI DA INTEGRARE ===
${corpus}

Aggiorna la sezione 7 integrando eventuali nuovi test o subtest.`,
    {
      maxOutputTokens: 8192,
      temperature: 0.2,
      thinkingBudget: 0,
    }
  )

  const testo = `${nuovoStile.trim()}\n\n${nuoviTest.trim()}`
  return { testo, relazioniUsate: usate, relazioniTotali: totali, charsCorpus }
}

export async function suggerisciTestDaArchivio(relazioni: Relazione[], templateEsistenti: string[]): Promise<string[]> {
  const relazioniAnonimizzate = await anonimizzaRelazioniPerAnalisi(relazioni)
  const { corpus } = costruisciCorpus(relazioniAnonimizzate, 'RELAZIONE')

  if (USE_MOCK_AI) {
    await new Promise<void>(resolve => setTimeout(resolve, 1400))
    return ['BVSCO-2', 'MT-3'] // Mock
  }

  const testo = await callGemini(
    `Sei un assistente clinico.
Nel testo fornito, elenca i nomi di test, batterie o questionari citati che NON sono già presenti in questa lista: [${templateEsistenti.join(', ')}].
Restituisci SOLO un JSON array di stringhe (es. ["TEMA-3", "BVN 5-11", "CPT-3"]), senza spiegazioni, introduzioni o testo libero attorno. 
Se non trovi nulla di nuovo, restituisci [].`,
    `=== RELAZIONI IN ARCHIVIO ===
${corpus}

Estrai la lista di test/batterie non già mappati.`
  )
  
  try {
    const raw = testo.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('Errore nel parse dei suggerimenti test:', e)
    return []
  }
}

export async function rilevaNomiTestDaProfilo(profiloStile: string, templateEsistenti: string[]): Promise<{ nome: string; categoria: string }[]> {
  if (USE_MOCK_AI) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      await new Promise<void>(resolve => setTimeout(resolve, 800))
    }
    const mock = [
      { nome: 'BVSCO-3', categoria: 'apprendimenti' },
      { nome: 'AC-MT', categoria: 'apprendimenti' },
      { nome: 'APL Medea', categoria: 'linguaggio' }
    ]
    return mock.filter(m => !templateEsistenti.some(ex => ex.toLowerCase() === m.nome.toLowerCase()))
  }

  const promptSystem = `Sei un assistente clinico.
Analizza il profilo di stile fornito e individua tutti i test clinici o batterie menzionati nella sezione 7 o in altre parti del profilo (escludi WISC-IV e NEPSY-II).
Restituisci esclusivamente un array JSON di oggetti con chiavi "nome" e "categoria" (scegli la categoria tra: cognitivo, nepsy, apprendimenti, questionari, altro).
Non includere i test già esistenti: [${templateEsistenti.join(', ')}].
Restituisci SOLO il JSON array grezzo, senza spiegazioni o formattazioni.`

  const testo = await callGemini(promptSystem, profiloStile, { maxOutputTokens: 1500, temperature: 0.1 })
  try {
    const raw = testo.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('Errore rilevamento nomi test da profilo:', e)
    return []
  }
}

export async function generaTemplateTest(testNome: string, profiloStile: string): Promise<any> {
  if (USE_MOCK_AI) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      await new Promise<void>(resolve => setTimeout(resolve, 1000))
    }
    if (testNome.toLowerCase().includes('bvsco')) {
      return {
        nome: 'BVSCO-3',
        categoria: 'apprendimenti',
        scalaDefault: {
          tipo: 'soglie_custom',
          soglie: [
            { min: 0, max: 4, etichetta: 'Richiesta di Intervento' },
            { min: 5, max: 15, etichetta: 'Attenzione' },
            { min: 16, max: null, etichetta: 'Sufficiente / Ottimale' }
          ]
        },
        campiPrincipali: [
          { key: 'dettato_brano', label: 'Dettato di brano', descr: 'Valutazione delle competenze ortografiche generali nella scrittura di testi.' },
          { key: 'scrittura_parole', label: 'Scrittura di parole', descr: 'Valutazione dell\'ortografia lessicale.' },
          { key: 'scrittura_non_parole', label: 'Scrittura di non-parole', descr: 'Valutazione della competenza fonologica di scrittura.' }
        ],
        gruppiSecondari: [
          {
            key: 'velocita',
            label: 'Velocità di scrittura',
            campi: [
              { key: 'fluenza_grafo', label: 'Fluenza Grafo-motoria' }
            ]
          }
        ],
        notaRange: '*BVSCO-3: percentili <5° indicano Richiesta di Intervento, tra 5° e 15° indicano Attenzione, >15° indicano prestazione Sufficiente.*',
        richiedeEtaValutazione: false,
        richiedeStrumentiUtilizzati: true
      }
    }
    return {
      nome: testNome,
      categoria: 'altro',
      scalaDefault: { tipo: 'scalare' },
      campiPrincipali: [
        { key: 'punteggio_totale', label: 'Punteggio Totale' }
      ],
      gruppiSecondari: [],
      notaRange: '',
      richiedeEtaValutazione: false,
      richiedeStrumentiUtilizzati: false
    }
  }

  const promptSystem = `Sei un assistente clinico esperto in psicometria e valutazione dello sviluppo.
Il tuo compito è analizzare la descrizione del test "${testNome}" presente nel Profilo di Stile fornito e strutturarlo in un oggetto JSON singolo che rappresenti il template del test.

Restituisci ESCLUSIVAMENTE un oggetto JSON valido (senza spiegazioni o markdown codeblocks tranne \`\`\`json se necessario):

\`\`\`json
{
  "nome": "${testNome}",
  "categoria": "apprendimenti", // una tra: "cognitivo", "nepsy", "apprendimenti", "questionari", "altro"
  "scalaDefault": {
    "tipo": "soglie_custom", // una tra: "qi_wisc", "scalare", "soglie_custom"
    "soglie": [ // Obbligatorio solo se tipo è "soglie_custom"
      { "min": 0, "max": 4, "etichetta": "Richiesta di Intervento" } // max può essere null se non c'è limite superiore
    ]
  },
  "campiPrincipali": [
    { 
      "key": "chiave_univoca_in_minuscolo", // es. "dettato_brano"
      "label": "Etichetta visualizzata", // es. "Dettato di brano"
      "descr": "Una breve frase-cornice descrittiva per la narrativa" // opzionale
    }
  ],
  "gruppiSecondari": [ // Sezioni secondarie/subtest opzionali
    {
      "key": "chiave_gruppo",
      "label": "Titolo Gruppo", // es. "Velocità di scrittura"
      "campi": [
        { "key": "chiave_subtest", "label": "Nome subtest" }
      ]
    }
  ],
  "notaRange": "*Nota metodologica descrittiva delle soglie*", // opzionale
  "richiedeEtaValutazione": false,
  "richiedeStrumentiUtilizzati": true
}
\`\`\`

Sii estremamente accurato nel mappare tutti i subtest, gli indici, le colonne e le soglie descritte nel profilo per questo specifico test.`

  const testo = await callGemini(promptSystem, profiloStile, { maxOutputTokens: 2500, temperature: 0.1 })
  try {
    const raw = testo.replace(/```json/g, '').replace(/```/g, '').trim()
    return JSON.parse(raw)
  } catch (e) {
    console.error(`Errore generazione template per test ${testNome}:`, e)
    return null
  }
}

export { USE_MOCK_AI }

