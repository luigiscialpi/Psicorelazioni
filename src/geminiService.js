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
} from './wizardToText'
import { getPazienteById } from './dataService'
import { anonimizzaTesto } from './anonimizza'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''
const USE_MOCK_AI = !API_KEY || API_KEY === 'YOUR_GEMINI_KEY'

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`

async function callGemini(systemPrompt, userPrompt) {
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function anonimizzaRelazioniPerAnalisi(relazioni) {
  return Promise.all((relazioni || []).map(async (r) => {
    let paziente = null
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

export async function preparaAnteprimaAnonimizzazione(relazioni) {
  return anonimizzaRelazioniPerAnalisi(relazioni)
}

// ── ANALISI STILE ──────────────────────────────────────────
export async function analizzaStile(relazioni) {
  const relazioniAnonimizzate = await anonimizzaRelazioniPerAnalisi(relazioni)

  if (USE_MOCK_AI) {
    await new Promise(r => setTimeout(r, 1800))
    return `# PROFILO DI STILE — Valutazioni neuropsicologiche
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
  }

  const corpus = relazioniAnonimizzate.map((r, i) =>
    `--- RELAZIONE ${i+1} (${r.tipo_relazione || 'tipo non specificato'}) ---\n${r.testo_anonimizzato}`
  ).join('\n\n')

  return callGemini(
    `Sei un assistente specializzato nell'analisi dello stile di scrittura di relazioni di valutazione neuropsicologica e dell'apprendimento in età evolutiva (tipo WISC-IV, NEPSY-II, DSA/ADHD, L.170/2010).
Analizza il corpus di relazioni fornite e produci un Profilo di Stile dettagliato in formato Markdown.
Il documento deve avere esattamente queste sezioni numerate:
1. Struttura standard (ordine delle sezioni, comprese quelle ricorrenti come anamnesi, osservazione, valutazione cognitiva, approfondimento neuropsicologico, apprendimenti, questionari, conclusioni, riferimenti normativi)
2. Registro linguistico (persona, tono, costrutti grammaticali preferiti)
3. Formule ricorrenti (frasi-cornice da riprodurre esattamente, in particolare quelle che introducono ciascun indice/test)
4. Come vengono trattate le tabelle di punteggio (mai generarle da zero, sempre riportate fedelmente da un testo incollato)
5. Terminologia preferita vs da evitare (tabella)
6. Lunghezza e ritmo (indicazioni quantitative)
Rispondi SOLO con il documento Markdown, senza introduzioni.`,
    `Analizza queste ${relazioniAnonimizzate.length} relazioni di valutazione neuropsicologica e produci il Profilo di Stile:\n\n${corpus}`
  )
}

// ── GENERAZIONE RELAZIONE ──────────────────────────────────
// ⚠️ SICUREZZA DATI: `wizard.anagrafica` (nome, cognome, data di
// nascita, scuola/classe) viene DELIBERATAMENTE rimosso dal payload
// prima di costruire qualunque prompt o chiamata a Gemini. Quei dati
// vengono ricomposti nel documento finale solo lato client, in
// RisultatoGenerazione.jsx + exportDocx.js, mai visti dall'AI.
export async function generaRelazione(profiloStile, wizardCompleto, esempi = []) {
  // Payload "pulito" — SENZA anagrafica reale
  const { anagrafica, ...wizard } = wizardCompleto

  // Precalcola testo/tabelle dalle strutture dati del wizard
  const anamnesiRemotaTxt   = wizard.anamnesi ? anamnesiRemotaToTesto(wizard.anamnesi) : ''
  const anamnesiRecenteTxt  = wizard.anamnesi ? anamnesiRecenteToTesto(wizard.anamnesi) : ''
  const osservazioneTxt     = wizard.osservazione ? osservazioneToTesto(wizard.osservazione) : ''
  const wiscTabella         = wizard.cognitivo ? wiscToMarkdownTable(wizard.cognitivo.punteggi || {}) : ''
  const wiscNarrativa       = wizard.cognitivo ? wiscToNarrativa(wizard.cognitivo.punteggi || {}) : ''
  const nepsyTabella        = wizard.nepsy ? nepsyToMarkdownTable(wizard.nepsy.punteggi || {}) : ''
  const nepsyNarrativa      = wizard.nepsy ? nepsyToNarrativa(wizard.nepsy.punteggi || {}) : ''

  if (USE_MOCK_AI) {
    await new Promise(r => setTimeout(r, 2200))
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

${wiscTabella || '[nessun punteggio inserito]'}

${wiscNarrativa}
${wizard.cognitivo?.note_cliniche || ''}
`
    if (sez.includes('nepsy')) out += `
## Approfondimento neuropsicologico

${nepsyTabella || '[nessun punteggio inserito]'}

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
    ? esempi.map((e, i) => `--- ESEMPIO ${i+1} ---\n${e.testo_markdown}`).join('\n\n')
    : ''

  // Payload testuale pronto — tabelle e narrativa già precalcolate,
  // Gemini le riceve come dato "finito" per le sezioni WISC/NEPSY,
  // mentre per le altre riceve ancora i campi grezzi del wizard
  const datiPerGemini = {
    ...wizard,
    anamnesi: wizard.anamnesi ? { remota: anamnesiRemotaTxt, recente: anamnesiRecenteTxt } : undefined,
    osservazione: wizard.osservazione ? { descrizione: osservazioneTxt, note: wizard.osservazione.note } : undefined,
    cognitivo: wizard.cognitivo ? { tabella_wisc: wiscTabella, narrativa_precalcolata: wiscNarrativa, note_cliniche: wizard.cognitivo.note_cliniche } : undefined,
    nepsy: wizard.nepsy ? { tabella_nepsy: nepsyTabella, narrativa_precalcolata: nepsyNarrativa, note_cliniche: wizard.nepsy.note_cliniche } : undefined,
  }

  return callGemini(
    `Sei un assistente specializzato nella redazione di relazioni di valutazione neuropsicologica e dell'apprendimento in età evolutiva.
REGOLA ASSOLUTA: scrivi ESCLUSIVAMENTE seguendo il Profilo di Stile fornito.
Non inventare mai punteggi o dati non presenti nell'input.
Per le sezioni "cognitivo" e "nepsy": il campo "tabella_wisc"/"tabella_nepsy" contiene una tabella Markdown già pronta — riportala FEDELMENTE così com'è, senza modificarla. Il campo "narrativa_precalcolata" contiene già le frasi-cornice standard con i punteggi inseriti — puoi usarlo come base ma puoi arricchirlo con le note_cliniche fornite.
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
export async function rigeneraSezione(profiloStile, sezione, testo, istruzione) {
  if (USE_MOCK_AI) {
    await new Promise(r => setTimeout(r, 1200))
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
export async function aggiornaProfiloIncrementale(profiloEsistente, nuoveRelazioni) {
  const relazioniAnonimizzate = await anonimizzaRelazioniPerAnalisi(nuoveRelazioni)

  if (USE_MOCK_AI) {
    await new Promise(r => setTimeout(r, 1400))
    // In mock: aggiunge solo una riga di nota in fondo al profilo
    const dataNow = new Date().toISOString().slice(0, 10)
    return profiloEsistente
      .replace(/Relazioni analizzate: \d+/, `Relazioni analizzate: ${profiloEsistente.match(/Relazioni analizzate: (\d+)/)?.[1] ?? '?'} + ${relazioniAnonimizzate.length} nuove`)
      .replace(/Ultimo aggiornamento: [\d-]+/, `Ultimo aggiornamento: ${dataNow}`)
      + `\n\n> *Aggiornamento incrementale del ${dataNow}: analizzate ${relazioniAnonimizzate.length} nuove relazioni. Nessuna modifica sostanziale rilevata rispetto al profilo precedente (demo).*`
  }

  const corpus = relazioniAnonimizzate.map((r, i) =>
    `--- NUOVA RELAZIONE ${i + 1} (${r.tipo_relazione || 'tipo non specificato'}) ---\n${r.testo_anonimizzato}`
  ).join('\n\n')

  return callGemini(
    `Sei un assistente specializzato nell'analisi dello stile di scrittura di relazioni di valutazione neuropsicologica.
Hai già un Profilo di Stile esistente. Vengono aggiunte nuove relazioni al corpus.
Il tuo compito è AGGIORNARE il profilo integrando eventuali pattern nuovi o correggendo quelli già presenti.
NON riscrivere il profilo da zero: parti da quello esistente e modifica solo ciò che cambia.
Se le nuove relazioni confermano il profilo senza aggiungere nulla di nuovo, rispondi con il profilo invariato.
Aggiorna la riga "Ultimo aggiornamento" e "Relazioni analizzate" in cima al documento.
Rispondi SOLO con il documento Markdown aggiornato, senza introduzioni.`,
    `=== PROFILO DI STILE ATTUALE ===
${profiloEsistente}

=== NUOVE RELAZIONI DA INTEGRARE (${relazioniAnonimizzate.length}) ===
${corpus}

Aggiorna il profilo integrando le osservazioni dalle nuove relazioni.`
  )
}

export { USE_MOCK_AI }
