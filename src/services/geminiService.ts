// ============================================================
// GEMINI SERVICE — chiama l'API o restituisce output mock
// Calibrato sulla struttura reale di relazioni di valutazione
// neuropsicologica/apprendimento (WISC-IV, NEPSY-II, CBCL/YSR...),
// identificata analizzando 3 relazioni reali (lette privatamente,
// mai usate come contenuto — solo per ricavarne lo scheletro).
// ============================================================

import {
  anamnesiRemotaToTesto, anamnesiRecenteToTesto, osservazioneToTesto,
  wiscToMarkdownTable, wiscToNarrativa, nepsyToMarkdownTable, nepsyToNarrativa,
  notaRangeWisc, notaRangeNepsy,
} from './wizardToText'
import { getPazienteById } from '../data/pazientiData'
import { anonimizzaTesto } from './anonimizza'
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
    riferimenti_subtest?: string
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
// ⚠️ SICUREZZA DATI: `wizard.anagrafica` (nome, cognome, data di
// nascita, scuola/classe) viene DELIBERATAMENTE rimosso dal payload
// prima di costruire qualunque prompt o chiamata a Gemini. Quei dati
// vengono ricomposti nel documento finale solo lato client, in
// RisultatoGenerazione.tsx + exportDocx.ts, mai visti dall'AI.
export async function generaRelazione(profiloStile: string, wizardCompleto: WizardPayload, esempi: Relazione[] = []): Promise<string> {
  // Payload "pulito" — SENZA anagrafica reale
  const { anagrafica: _anagrafica, ...wizard } = wizardCompleto

  // Precalcola testo/tabelle dalle strutture dati del wizard
  const anamnesiRemotaTxt   = wizard.anamnesi ? anamnesiRemotaToTesto(wizard.anamnesi) : ''
  const anamnesiRecenteTxt  = wizard.anamnesi ? anamnesiRecenteToTesto(wizard.anamnesi) : ''
  const osservazioneTxt     = wizard.osservazione ? osservazioneToTesto(wizard.osservazione) : ''
  const wiscTabella         = wizard.cognitivo ? wiscToMarkdownTable(wizard.cognitivo.punteggi || {}) : ''
  const wiscNotaRange       = wizard.cognitivo?.includi_nota_range ? notaRangeWisc() : ''
  const wiscNarrativa       = wizard.cognitivo
    ? wiscToNarrativa(wizard.cognitivo.punteggi || {}, wizard.cognitivo.riferimenti_subtest || '')
    : ''
  const nepsyTabella        = wizard.nepsy ? nepsyToMarkdownTable(wizard.nepsy.punteggi || {}) : ''
  const nepsyNotaRange      = wizard.nepsy?.includi_nota_range ? notaRangeNepsy() : ''
  const nepsyNarrativa      = wizard.nepsy ? nepsyToNarrativa(wizard.nepsy.punteggi || {}) : ''

  if (USE_MOCK_AI) {
    await new Promise<void>(resolve => setTimeout(resolve, 2200))
    const sez = wizard.sezioni_attive || []
    let out = `# Relazione di Valutazione Neuropsicologica

## Dati e motivo dell'invio
Il/la paziente viene inviato/a da ${wizard.tipo_invio || '[inviante]'} per ${wizard.motivo_invio || 'valutazione neuropsicologica'}.
`
    if (sez.includes('anamnesi')) out += `
## Anamnesi
${anamnesiRemotaTxt ? 'Anamnesi remota: ' + anamnesiRemotaTxt : ''}
${anamnesiRecenteTxt ? 'Situazione attuale: ' + anamnesiRecenteTxt : ''}
`
    if (sez.includes('osservazione')) out += `
## Osservazione comportamentale
${osservazioneTxt}
`
    if (sez.includes('cognitivo')) out += `
## Valutazione cognitiva

  ${wizard.cognitivo?.eta_valutazione ? `Età al momento della valutazione: ${wizard.cognitivo.eta_valutazione}.` : ''}
  ${wizard.cognitivo?.strumenti_utilizzati ? `Strumenti utilizzati: ${wizard.cognitivo.strumenti_utilizzati}` : ''}

${wiscTabella || '[nessun punteggio inserito]'}

  ${wiscNotaRange}

${wiscNarrativa}
${wizard.cognitivo?.note_cliniche || ''}
`
    if (sez.includes('nepsy')) out += `
## Approfondimento neuropsicologico

  ${wizard.nepsy?.strumenti_utilizzati ? `Strumenti utilizzati: ${wizard.nepsy.strumenti_utilizzati}` : ''}

${nepsyTabella || '[nessun punteggio inserito]'}

  ${nepsyNotaRange}

${nepsyNarrativa}
${wizard.nepsy?.note_cliniche || ''}
`
    if (sez.includes('apprendimenti')) out += `
## Valutazione apprendimenti
${wizard.apprendimenti?.strumenti || '—'}

${wizard.apprendimenti?.punteggi_grezzi || '[tabella punteggi]'}

${wizard.apprendimenti?.lettura || ''} ${wizard.apprendimenti?.scrittura || ''} ${wizard.apprendimenti?.matematica || ''}
`
    if (sez.includes('questionari')) out += `
## Questionari
${wizard.questionari?.tipo || '—'}

${wizard.questionari?.punteggi_grezzi || '[tabella punteggi]'}

${wizard.questionari?.note_cliniche || ''}
`
    if (sez.includes('conclusioni')) out += `
## Conclusioni
Alla luce di quanto emerso dalla valutazione, si rileva ${wizard.conclusioni?.diagnosi || '[diagnosi]'} ${wizard.conclusioni?.codice_icd ? '(' + wizard.conclusioni.codice_icd + ')' : ''}.

${wizard.conclusioni?.consigli_paziente ? 'Consigli: ' + wizard.conclusioni.consigli_paziente : ''}
${wizard.conclusioni?.consigli_scuola ? 'Indicazioni per la scuola: ' + wizard.conclusioni.consigli_scuola : ''}
${wizard.conclusioni?.strumenti_compensativi ? 'Strumenti compensativi: ' + wizard.conclusioni.strumenti_compensativi : ''}
${wizard.conclusioni?.misure_dispensative ? 'Misure dispensative: ' + wizard.conclusioni.misure_dispensative : ''}

Si rilascia alla famiglia per gli usi consentiti dalla Legge 170/2010.
`
    return out.trim()
  }

  const esempiFewShot = esempi.length > 0
    ? esempi.map((e: Relazione, i: number) => `--- ESEMPIO ${i+1} ---\n${e.testo_markdown}`).join('\n\n')
    : ''

  // Payload testuale pronto — tabelle e narrativa già precalcolate,
  // Gemini le riceve come dato "finito" per le sezioni WISC/NEPSY,
  // mentre per le altre riceve ancora i campi grezzi del wizard
  const datiPerGemini = {
    ...wizard,
    anamnesi: wizard.anamnesi ? { remota: anamnesiRemotaTxt, recente: anamnesiRecenteTxt } : undefined,
    osservazione: wizard.osservazione ? { descrizione: osservazioneTxt, note: wizard.osservazione.note } : undefined,
    cognitivo: wizard.cognitivo
      ? {
          eta_valutazione: wizard.cognitivo.eta_valutazione || '',
          strumenti_utilizzati: wizard.cognitivo.strumenti_utilizzati || '',
          tabella_wisc: wiscTabella,
          nota_range_wisc: wiscNotaRange,
          narrativa_precalcolata: wiscNarrativa,
          riferimenti_subtest: wizard.cognitivo.riferimenti_subtest || '',
          note_cliniche: wizard.cognitivo.note_cliniche,
        }
      : undefined,
    nepsy: wizard.nepsy
      ? {
          strumenti_utilizzati: wizard.nepsy.strumenti_utilizzati || '',
          tabella_nepsy: nepsyTabella,
          nota_range_nepsy: nepsyNotaRange,
          narrativa_precalcolata: nepsyNarrativa,
          note_cliniche: wizard.nepsy.note_cliniche,
        }
      : undefined,
  }

  return callGemini(
    `Sei un assistente specializzato nella redazione di relazioni di valutazione neuropsicologica e dell'apprendimento in età evolutiva.
REGOLA ASSOLUTA: scrivi ESCLUSIVAMENTE seguendo il Profilo di Stile fornito.
Non inventare mai punteggi o dati non presenti nell'input.
Per le sezioni "cognitivo" e "nepsy": il campo "tabella_wisc"/"tabella_nepsy" contiene una tabella Markdown già pronta — riportala FEDELMENTE così com'è, senza modificarla. Il campo "narrativa_precalcolata" contiene già le frasi-cornice standard con i punteggi inseriti — puoi usarlo come base ma puoi arricchirlo con le note_cliniche fornite.
Se presenti, riporta i campi "eta_valutazione", "strumenti_utilizzati", "nota_range_wisc" e "nota_range_nepsy" nella rispettiva sezione senza alterarli semanticamente.
Se "riferimenti_subtest" è vuoto o assente, NON inventare riferimenti ai subtest (es. "CO pp. 10"). Se è presente, usalo solo nella sezione cognitiva pertinente.
Non duplicare le tabelle: ogni tabella deve comparire una sola volta nella sua sezione, senza copia/incolla in altre parti del testo.
Non usare mai nomi reali o dati identificativi: usa solo "il/la paziente". Non riceverai comunque questi dati.
Includi solo le sezioni effettivamente presenti nei dati forniti.
Rispondi SOLO con la relazione in Markdown, senza introduzioni o commenti.

=== PROFILO DI STILE (priorità massima) ===
${profiloStile}

${esempiFewShot ? `=== ESEMPI DI RIFERIMENTO ===\n${esempiFewShot}` : ''}`,
    `Genera la relazione completa in Markdown con questi dati:\n\n${JSON.stringify(datiPerGemini, null, 2)}`
  )
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
