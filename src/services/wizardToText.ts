// ============================================================
// WIZARD → TESTO — trasforma le strutture dati del wizard
// (voci checkbox selezionate, punteggi numerici) in testo/tabelle
// pronte da passare a Gemini o da inserire nel DOCX finale.
// Centralizzato qui per essere condiviso tra geminiService.ts
// e exportDocx.ts senza duplicare la logica.
// ============================================================

import {
  ANAMNESI_REMOTA_VOCI, ANAMNESI_RECENTE_VOCI,
  OSSERVAZIONE_ADATTAMENTO_VOCI, OSSERVAZIONE_ATTEGGIAMENTO_VOCI,
} from '../components/constants/anamnesiVoci'
import { MOCK_WISC_IV_TEMPLATE, MOCK_NEPSY_II_TEMPLATE } from '../data/mockTemplates'
import { generaSezioneTest, generaTabella, generaNarrativa, calcolaNarrativaGruppi } from './testTemplateEngine'
import type { RisultatoTest, TestTemplate } from '../core/testTemplate'

import {
  WISC_IV_CAMPI, NEPSY_II_DOMINI, fasciaWISC, fasciaScalare,
  WISC_IV_SUBTEST_PER_INDICE, WISC_IV_INDICE_LABEL,
} from '../components/constants/testDefinitions'

// Converte le voci selezionate (+ eventuali dettagli) in una frase discorsiva
function vociToTesto(vociSelezionate, vociDisponibili, dettagli = {}) {
  const frasi = vociSelezionate.map(id => {
    const voce = vociDisponibili.find(v => v.id === id)
    if (!voce) return null
    const dett = dettagli[id]
    return dett ? `${voce.testo} (${dett})` : voce.testo
  }).filter(Boolean)
  if (frasi.length === 0) return ''
  // Prima lettera maiuscola, unite con virgola, punto finale
  const testo = frasi.join(', ')
  return testo.charAt(0).toUpperCase() + testo.slice(1) + '.'
}

export function anamnesiRemotaToTesto(anamnesi) {
  const base  = vociToTesto(anamnesi.remota_voci, ANAMNESI_REMOTA_VOCI, anamnesi.remota_dettagli)
  const extra = anamnesi.remota_extra?.trim()
  return [base, extra].filter(Boolean).join(' ')
}

export function anamnesiRecenteToTesto(anamnesi) {
  const base  = vociToTesto(anamnesi.recente_voci, ANAMNESI_RECENTE_VOCI, anamnesi.recente_dettagli)
  const extra = anamnesi.recente_extra?.trim()
  return [base, extra].filter(Boolean).join(' ')
}

export function osservazioneToTesto(osservazione) {
  const adattamento   = vociToTesto(osservazione.adattamento_voci, OSSERVAZIONE_ADATTAMENTO_VOCI)
  const atteggiamento = vociToTesto(osservazione.atteggiamento_voci, OSSERVAZIONE_ATTEGGIAMENTO_VOCI)
  return [adattamento, atteggiamento, osservazione.note?.trim()].filter(Boolean).join(' ')
}

// ── Rimozione di tabelle Markdown residue dal testo narrativo ──
// Gemini riceve istruzione esplicita di non riportare tabelle (già
// inserite deterministicamente altrove), ma i modelli linguistici
// tendono a "confermare visivamente" i dati numerici appena
// processati ripetendoli in una tabella — nonostante l'istruzione.
// Questa è una difesa STRUTTURALE, non un'ulteriore istruzione:
// rimuove qualunque blocco che assomigli a una tabella Markdown
// (righe consecutive che iniziano con "|") dal testo prima di
// concatenarlo con la tabella vera in assemblaDocumentoMarkdown().
// Rimuove anche eventuali righe di intestazione ripetute (es. "WISC-IV
// scale | Indici/QI | ...") che a volte Gemini include come titolo
// prima della tabella indesiderata, e la nota esplicativa in corsivo
// che tipicamente segue una tabella (es. "*WISC-IV: QI >129 molto
// superiore...*") — anche questa viene ripetuta da Gemini nonostante
// non contenga "|", quindi sfuggiva al filtro basato solo sulle righe
// tabellari. Riconosciuta genericamente come riga in corsivo che
// inizia con un nome di test seguito da ":", presente SOLO se segue
// immediatamente (a distanza di una riga vuota) una tabella appena
// rimossa — non tocca note legittime che compaiono altrove nel testo.
const PATTERN_NOTA_RANGE = /^\s*\*[A-Z][\w-]*(-II)?:\s.*\*\s*$/

// ── Titolo di sezione per un template (dinamico o mock) ──────
// Condiviso tra assemblaDocumentoMarkdown() (che scrive "## <titolo>" nel
// markdown) ed exportDocx.ts (che deve riconoscere lo stesso titolo per
// decidere se disegnare una tabella Word nativa invece di testo semplice).
// Un'unica fonte di verità evita che le due stringhe divergano in futuro.
export function titoloSezioneTest(template: { categoria: string; nome: string }): string {
  const perCategoria: Record<string, string> = {
    cognitivo: 'Valutazione cognitiva',
    nepsy: 'Approfondimento neuropsicologico',
    apprendimenti: 'Valutazione apprendimenti',
    questionari: 'Questionari',
  }
  return perCategoria[template.categoria] || template.nome
}

export function rimuoviTabelleMarkdown(testo: string): string {
  if (!testo) return testo

  const righe = testo.split('\n')
  const risultato: string[] = []
  let dentroTabella = false
  let appenaUscitoDaTabella = false

  for (const riga of righe) {
    const isRigaTabella = /^\s*\|.*\|\s*$/.test(riga)
    const isSeparatoreTabella = /^\s*\|?[\s:|-]+\|?\s*$/.test(riga) && riga.includes('-')

    if (isRigaTabella || (dentroTabella && isSeparatoreTabella)) {
      dentroTabella = true
      continue
    }

    // Riga vuota subito dopo una tabella: la si scarta una sola volta
    // per non lasciare doppio spazio, poi si torna al testo normale
    if (dentroTabella && riga.trim() === '') {
      dentroTabella = false
      appenaUscitoDaTabella = true
      continue
    }

    // Nota range in corsivo, presente solo se la riga precedente utile
    // era la tabella appena rimossa — evita di scartare una nota che
    // compare legittimamente altrove nel testo narrativo.
    if (appenaUscitoDaTabella && PATTERN_NOTA_RANGE.test(riga)) {
      appenaUscitoDaTabella = false
      continue
    }

    dentroTabella = false
    appenaUscitoDaTabella = false
    risultato.push(riga)
  }

  // Collassa eventuali righe vuote multiple lasciate dalla rimozione
  const output = risultato.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (output.includes('|')) {
    console.warn('[rimuoviTabelleMarkdown] Possibile tabella Markdown non rimossa completamente dal testo generato da Gemini.')
  }
  return output
}

// ── Tabella WISC-IV in Markdown, pronta per Gemini e per il parser di exportDocx.ts ──
// `interpretabilita` è un oggetto opzionale { [chiaveIndice]: boolean },
// dove true = "Sì" (default se assente, coerente col comportamento
// storico della funzione), false = "No". La colonna "Interpretabilità"
// viene mostrata in tabella SOLO se almeno un indice compilato ha
// interpretabilità = false — quando tutti gli indici sono "Sì" (il caso
// più comune) la colonna è ridondante e viene omessa per non appesantire
// la tabella con un'informazione che non aggiunge nulla.
export function wiscToMarkdownTable(punteggi, interpretabilita: Record<string, boolean> = {}) {
  const righeValide = WISC_IV_CAMPI.filter(c => punteggi[c.key])
  if (righeValide.length === 0) return ''

  // Default true (Sì) per qualunque indice non esplicitamente marcato —
  // preserva il comportamento precedente quando il parametro non è passato.
  const valori = righeValide.map(c => interpretabilita[c.key] !== false)
  const mostraColonna = valori.some(v => v === false)

  let md = mostraColonna
    ? '| WISC-IV scale | Indici/QI | Categoria descrittiva | Interpretabilità |\n|---|---|---|---|\n'
    : '| WISC-IV scale | Indici/QI | Categoria descrittiva |\n|---|---|---|\n'

  for (const c of righeValide) {
    const val = punteggi[c.key]
    const interpretabile = interpretabilita[c.key] !== false
    md += mostraColonna
      ? `| ${c.label} | ${val} | ${fasciaWISC(val)} | ${interpretabile ? 'Sì' : 'No'} |\n`
      : `| ${c.label} | ${val} | ${fasciaWISC(val)} |\n`
  }
  return md
}

export function notaRangeWisc() {
  return '*WISC-IV: QI >129 molto superiore, 120-129 superiore, 110-119 medio-superiore, 90-109 media, 80-89 media inferiore, 70-79 inferiore alla media, <69 molto inferiore alla norma.*'
}

// Testo narrativo per gli indici WISC compilati — frase-cornice fissa + fascia calcolata
export function wiscToNarrativa(punteggi, subtestPp: Record<string, string | number> = {}) {
  const base = WISC_IV_CAMPI
    .filter(c => punteggi[c.key] && c.tipo !== 'totale')
    .map(c => `${c.descr} Il punteggio ottenuto (${punteggi[c.key]}) si colloca nella fascia "${fasciaWISC(punteggi[c.key])}".`)
    .join(' ')

  const rif = wiscSubtestPpToNarrativa(subtestPp)

  if (!rif) return base

  return [base, rif].filter(Boolean).join(' ')
}

// Testo narrativo (mai tabellare) per i punti ponderati dei subtest per
// indice. Compila solo gli indici con almeno un subtest valorizzato —
// restano tutti facoltativi. Il risultato è pensato per essere
// incollato dopo la frase-cornice dell'indice corrispondente.
export function wiscSubtestPpToNarrativa(subtestPp: Record<string, string | number> = {}) {
  if (!subtestPp || typeof subtestPp !== 'object') return ''

  const frasiPerIndice: string[] = []

  for (const [indiceKey, indiceLabel] of Object.entries(WISC_IV_INDICE_LABEL)) {
    const subtestIndice = WISC_IV_SUBTEST_PER_INDICE[indiceKey] || []
    const compilati = subtestIndice.filter(st => subtestPp[st.key] !== undefined && subtestPp[st.key] !== '')
    if (compilati.length === 0) continue

    const dettagli = compilati
      .map(st => `${st.label} (pp ${subtestPp[st.key]}, fascia ${fasciaScalare(subtestPp[st.key]).toLowerCase()})`)
      .join(', ')

    frasiPerIndice.push(`Per l'indice ${indiceLabel} sono stati considerati i seguenti subtest: ${dettagli}.`)
  }

  return frasiPerIndice.join(' ')
}

// ── Tabella NEPSY-II in Markdown ──────────────────────────
export function nepsyToMarkdownTable(punteggi) {
  const domWithData = NEPSY_II_DOMINI
    .map(d => ({ ...d, subtest: d.subtest.filter(s => punteggi[s.key]) }))
    .filter(d => d.subtest.length > 0)

  if (domWithData.length === 0) return ''

  let md = '| NEPSY-II sottotest | Punteggio scalare | Fascia |\n|---|---|---|\n'
  for (const dom of domWithData) {
    for (const st of dom.subtest) {
      md += `| ${st.label} (${dom.dominio}) | ${punteggi[st.key]} | ${fasciaScalare(punteggi[st.key])} |\n`
    }
  }
  return md
}

export function notaRangeNepsy() {
  return '*NEPSY-II: punteggi scalari con media 10 e DS 3; valori più alti indicano prestazioni migliori. Interpretazione contestualizzata al dominio valutato.*'
}

export function nepsyToNarrativa(punteggi) {
  const nomi = []
  for (const dom of NEPSY_II_DOMINI) {
    for (const st of dom.subtest) {
      if (punteggi[st.key]) {
        nomi.push(`${st.label} (fascia ${fasciaScalare(punteggi[st.key]).toLowerCase()})`)
      }
    }
  }
  if (nomi.length === 0) return ''
  return `Le prestazioni ai sottotest somministrati risultano: ${nomi.join(', ')}.`
}

// ── Rimozione di tabelle Markdown duplicate a livello DOCUMENTO ──
// Rete di sicurezza aggiuntiva rispetto a rimuoviTabelleMarkdown():
// quella agisce SOLO sul testo narrativo di cognitivo/nepsy prima
// che venga concatenato. Questa agisce sul documento GIÀ assemblato,
// individuando blocchi tabella con contenuto duplicato (stessa
// sequenza di righe "| ... |") ovunque si trovino nel testo finale,
// e tenendo solo la prima occorrenza di ciascuna. Copre casi in cui
// una tabella indesiderata sfugge al filtro per-sezione — ad esempio
// se finisce, per un fallimento di parsing non ancora identificato,
// in una porzione di testo diversa da quella attesa.
function rimuoviTabelleDuplicateDalDocumento(documento: string): string {
  const righe = documento.split('\n')
  const blocchi: { start: number; end: number; firma: string }[] = []
  let i = 0

  while (i < righe.length) {
    if (/^\s*\|.*\|\s*$/.test(righe[i])) {
      const start = i
      const contenutoBlocco: string[] = []
      while (i < righe.length && /^\s*\|.*\|\s*$/.test(righe[i])) {
        contenutoBlocco.push(righe[i].trim())
        i++
      }
      // Firma = solo le righe dati (esclude l'eventuale riga separatore
      // |---|---|), normalizzata su spazi, per confrontare il CONTENUTO
      // informativo della tabella indipendentemente da spaziature diverse.
      const firma = contenutoBlocco
        .filter(r => !/^\|[\s:|-]+\|$/.test(r))
        .join('\n')
        .replace(/\s+/g, ' ')
      blocchi.push({ start, end: i - 1, firma })
    } else {
      i++
    }
  }

  const firmeViste = new Set<string>()
  const daRimuovere = new Set<number>()

  for (const b of blocchi) {
    if (!b.firma) continue
    if (firmeViste.has(b.firma)) {
      for (let r = b.start; r <= b.end; r++) daRimuovere.add(r)
    } else {
      firmeViste.add(b.firma)
    }
  }

  if (daRimuovere.size === 0) return documento

  console.warn('[rimuoviTabelleDuplicateDalDocumento] Rilevata e rimossa una tabella duplicata nel documento finale — verificare la causa a monte (parsing risposta Gemini).')

  return righe
    .filter((_, idx) => !daRimuovere.has(idx))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

// ── Pulizia del testo e rimozione di duplicati intestazioni della sezione ──
// Rete di sicurezza per ripulire intestazioni di sezione duplicate generate
// dall'AI che a volte ripete `# Conclusioni` o `## CONCLUSIONI` all'interno
// del blocco di testo narrativo fornito.
export function pulisciSezioneDaIntestazioni(testo: string, titoloSezione: string): string {
  if (!testo) return testo
  const righe = testo.split('\n')
  const titoloClean = titoloSezione.trim().toLowerCase()
  
  const filtered = righe.filter(riga => {
    const raw = riga.trim().toLowerCase()
    // Controlla se la riga è un header markdown (es. #, ##, ###) che contiene il nome del titolo o simile
    if (raw.startsWith('#')) {
      const pulito = raw.replace(/^#+\s*/, '')
      if (pulito === titoloClean || pulito.includes(titoloClean) || titoloClean.includes(pulito)) {
        return false // rimuovi l'intestazione duplicata
      }
    }
    return true
  })
  
  return filtered.join('\n').trim()
}

// ── Rimozione di formule di rilascio duplicate ──
// Evita che nel documento finale compaiano duplicati di frasi fisse come
// "Si rilascia ai genitori..." o "Si rilascia alla famiglia per gli usi consentiti...".
export function rimuoviFormuleRilascioDuplicate(tabellaOMarkdown: string): string {
  if (!tabellaOMarkdown) return tabellaOMarkdown
  
  const righe = tabellaOMarkdown.split('\n')
  const formulePattern = [
    /si rilascia/i,
    /per gli usi consentiti/i,
    /legge 170/i
  ]
  
  let formulaTrovata = false
  const filtered = righe.filter(riga => {
    const isFormula = formulePattern.some(p => p.test(riga))
    if (isFormula) {
      if (formulaTrovata) {
        // Abbiamo già questa formula, eliminiamo la duplicazione
        return false
      }
      formulaTrovata = true
    }
    return true
  })
  
  return filtered.join('\n').trim()
}

export function assemblaDocumentoMarkdown(wizard, narrativaPerSezione = {}, templates: TestTemplate[] = []) {
  const sez = wizard.sezioni_attive || []
  const templatesById = new Map<string, TestTemplate>([
    ['wisc-iv', MOCK_WISC_IV_TEMPLATE],
    ['nepsy-ii', MOCK_NEPSY_II_TEMPLATE],
    ...templates.map(t => [t.id, t] as [string, TestTemplate])
  ])
  let out = '# Relazione di Valutazione Neuropsicologica\n\n'
  out += '## Dati e motivo dell\'invio\n'
  const narrativaIntestazione = pulisciSezioneDaIntestazioni(rimuoviTabelleMarkdown(narrativaPerSezione['intestazione'] || ''), 'dati e motivo')
  if (narrativaIntestazione) {
    out += narrativaIntestazione + '\n'
  } else {
    const chiInvia = [wizard.nome_inviante, wizard.tipo_invio].filter(Boolean).join(', ') || '[inviante]'
    out += `Il/la paziente viene inviato/a da ${chiInvia} per ${wizard.motivo_invio || 'valutazione neuropsicologica'}.\n`
  }

  if (sez.includes('anamnesi')) {
    out += '\n## Anamnesi\n'
    // Preferisce il testo riscritto da Gemini in stile narrativo coerente
    // col Profilo di Stile; se assente (es. modalità mock, o generazione
    // fallita per questa sezione), ricade sulla composizione deterministica
    // da vociToTesto — meno elegante ma sempre disponibile, non lascia mai
    // la sezione vuota.
    const narrativaAnamnesi = pulisciSezioneDaIntestazioni(rimuoviTabelleMarkdown(narrativaPerSezione['anamnesi'] || ''), 'anamnesi')
    if (narrativaAnamnesi) {
      out += narrativaAnamnesi + '\n'
    } else if (wizard.anamnesi) {
      const remota = anamnesiRemotaToTesto(wizard.anamnesi)
      const recente = anamnesiRecenteToTesto(wizard.anamnesi)
      if (remota) out += `Anamnesi remota: ${remota} `
      if (recente) out += `Situazione attuale: ${recente}`
      out += '\n'
    }
  }

  if (sez.includes('osservazione')) {
    out += '\n## Osservazione comportamentale\n'
    const narrativaOss = pulisciSezioneDaIntestazioni(rimuoviTabelleMarkdown(narrativaPerSezione['osservazione'] || ''), 'osservazione')
    if (narrativaOss) {
      out += narrativaOss + '\n'
    } else {
      const oss = osservazioneToTesto(wizard.osservazione)
      out += (oss || '') + '\n'
    }
  }

  // ── Template dinamici (id = UUID, creati in Gestione Test) ──
  // Stessa logica di cognitivo/nepsy ma per test/questionari custom:
  // tabella + narrativa costruite sui punteggi REALI in wizard.test_risultati,
  // mai lasciando che la sezione mostri solo il vecchio campo libero
  // (quello resta gestito più sotto in 'questionari' solo come fallback
  // per relazioni compilate prima dell'introduzione dei template dinamici).
  for (const sezId of sez) {
    const template = templatesById.get(sezId)
    const risultato: RisultatoTest | undefined = wizard.test_risultati?.[sezId]
    if (!template || !risultato?.somministrato) continue

    const titolo = titoloSezioneTest(template)
    out += `\n## ${titolo}\n`
    if (template.richiedeStrumentiUtilizzati && risultato.strumentiUtilizzati) {
      out += `Strumenti utilizzati: ${risultato.strumentiUtilizzati}.\n\n`
    }
    out += generaTabella(template, risultato)

    let narrativaDinamica = pulisciSezioneDaIntestazioni(rimuoviTabelleMarkdown(narrativaPerSezione[sezId] || ''), titolo)
    narrativaDinamica = pulisciSezioneDaIntestazioni(narrativaDinamica, template.nome)
    
    if (narrativaDinamica) {
      out += narrativaDinamica + '\n\n'
    } else {
      out += generaNarrativa(template, risultato)
      out += calcolaNarrativaGruppi(template, risultato)
    }

    if (risultato.includiNotaRange !== false && template.notaRange) {
      out += `${template.notaRange}\n\n`
    }
  }

  if (sez.includes('apprendimenti')) {
    out += '\n## Valutazione apprendimenti\n'
    if (wizard.apprendimenti?.strumenti) out += `${wizard.apprendimenti.strumenti}\n\n`
    if (wizard.apprendimenti?.punteggi_grezzi) out += `${wizard.apprendimenti.punteggi_grezzi}\n\n`
    // Testo narrativo di Gemini (se presente) integra ora anche le note
    // di lettura/scrittura/matematica, tessute in prosa — non vengono più
    // riappese come frasi isolate in coda (vedi geminiService.ts).
    const narrativaApp = pulisciSezioneDaIntestazioni(rimuoviTabelleMarkdown(narrativaPerSezione['apprendimenti'] || ''), 'apprendimenti')
    if (narrativaApp) {
      out += narrativaApp + '\n'
    } else {
      const parti = [wizard.apprendimenti?.lettura, wizard.apprendimenti?.scrittura, wizard.apprendimenti?.matematica].filter(Boolean)
      if (parti.length) out += parti.join(' ') + '\n'
    }
  }

  if (sez.includes('questionari')) {
    out += '\n## Questionari\n'
    if (wizard.questionari?.tipo) out += `${wizard.questionari.tipo}\n\n`
    if (wizard.questionari?.punteggi_grezzi) out += `${wizard.questionari.punteggi_grezzi}\n\n`
    const narrativaQ = pulisciSezioneDaIntestazioni(rimuoviTabelleMarkdown(narrativaPerSezione['questionari'] || ''), 'questionari')
    if (narrativaQ) out += narrativaQ + '\n'
    if (wizard.questionari?.note_cliniche) out += wizard.questionari.note_cliniche + '\n'
  }

  if (sez.includes('conclusioni')) {
    out += '\n## Conclusioni\n'
    // Il testo narrativo di Gemini (sintesi articolata del quadro
    // complessivo, vedi generaNarrativaSezioni) viene anteposto al
    // template fisso di diagnosi/consigli — prima era generato ma mai
    // usato, il che contribuiva a relazioni percepite como "scarne"
    // anche quando Gemini aveva prodotto un'analisi ricca.
    const narrativaConcl = pulisciSezioneDaIntestazioni(rimuoviTabelleMarkdown(narrativaPerSezione['conclusioni'] || ''), 'conclusioni')
    if (narrativaConcl) {
      // Gemini ha prodotto una narrativa strutturata che integra già
      // diagnosi, consigli, strumenti e misure — non duplicarli.
      out += narrativaConcl + '\n\n'
    } else {
      // Fallback: nessuna narrativa Gemini, esponi i campi grezzi
      if (wizard.conclusioni?.diagnosi) {
        out += `Alla luce di quanto emerso dalla valutazione, si rileva ${wizard.conclusioni.diagnosi}`
        if (wizard.conclusioni?.codice_icd) out += ` (${wizard.conclusioni.codice_icd})`
        out += '.\n\n'
      }
      if (wizard.conclusioni?.consigli_paziente) out += `Consigli: ${wizard.conclusioni.consigli_paziente}\n`
      if (wizard.conclusioni?.consigli_scuola) out += `Indicazioni per la scuola: ${wizard.conclusioni.consigli_scuola}\n`
      if (wizard.conclusioni?.strumenti_compensativi) out += `Strumenti compensativi: ${wizard.conclusioni.strumenti_compensativi}\n`
      if (wizard.conclusioni?.misure_dispensative) out += `Misure dispensative: ${wizard.conclusioni.misure_dispensative}\n`
    }
    out += '\nSi rilascia alla famiglia per gli usi consentiti dalla Legge 170/2010.\n'
  }

  // Rimuovi eventuali formule di rilascio duplicate (ad es. se Gemini le include in narrativa e le abbiamo già fisse)
  const documentoPulito = rimuoviFormuleRilascioDuplicate(out.trim())
  return rimuoviTabelleDuplicateDalDocumento(documentoPulito)
}

// ── Sostituzione dei segnaposto con dati reali o formule calcolate ──
// Questa funzione va chiamata SOLO lato client, DOPO aver ricevuto il testo generato,
// in un punto che ha accesso all'anagrafica reale (RisultatoGenerazione.tsx).
// Oltre al nome, sostituisce altri bracketed token e normalizza date/scuola se necessario.
export function sostituisciNomePlaceholder(testo: string, anagrafica?: { nome?: string; cognome?: string; data_nascita?: string; scuola_classe?: string } | null): string {
  if (!testo) return testo
  
  let out = testo
  
  if (anagrafica) {
    const nome = anagrafica.nome?.trim() || ''
    const cognome = anagrafica.cognome?.trim() || ''
    const dataNascitaVal = anagrafica.data_nascita?.trim() || ''
    const scuolaClasseVal = anagrafica.scuola_classe?.trim() || ''
    
    // 1. Sostituzione {{NOME}} standard
    if (nome) {
      out = out.replaceAll('{{NOME}}', nome)
    }
    
    // 2. Sostituzioni bracketed addizionali per date di nascita, anno scolastico e contestuali se Gemini li ha scritti in alto o nel testo
    const tokenMappa: Record<string, string> = {
      '[NOME]': nome,
      '[COGNOME]': cognome,
      '[PAZIENTE]': nome,
      '[DATA]': new Date().toLocaleDateString('it-IT'),
      '[ANNO SCOLASTICO]': calcolaAnnoScolastico(new Date()),
    }
    
    if (dataNascitaVal) {
      tokenMappa['[DATA DI NASCITA]'] = formattaDataIt(dataNascitaVal)
      tokenMappa['[DATA_NASCITA]'] = formattaDataIt(dataNascitaVal)
    }
    if (scuolaClasseVal) {
      tokenMappa['[SCUOLA_CLASSE]'] = scuolaClasseVal
      tokenMappa['[SCUOLA CLASSE]'] = scuolaClasseVal
      tokenMappa['[CLASSE]'] = scuolaClasseVal
    }
    
    for (const [token, val] of Object.entries(tokenMappa)) {
      if (val) {
        out = out.replaceAll(token, val)
      }
    }
  }
  
  return out
}

function formattaDataIt(dataStr: string): string {
  if (!dataStr) return ''
  try {
    const d = new Date(dataStr)
    if (isNaN(d.getTime())) return dataStr
    return d.toLocaleDateString('it-IT')
  } catch {
    return dataStr
  }
}

function calcolaAnnoScolastico(dataRef: Date): string {
  const mese = dataRef.getMonth() // 0-indexed (0 = Gennaio)
  const anno = dataRef.getFullYear()
  if (mese >= 8) { // Settembre o dopo
    return `${anno}/${anno + 1}`
  } else {
    return `${anno - 1}/${anno}`
  }
}
