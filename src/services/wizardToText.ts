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
import { WISC_IV_CAMPI, NEPSY_II_DOMINI, fasciaWISC, fasciaScalare } from '../components/constants/testDefinitions'

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
export function wiscToMarkdownTable(punteggi) {
  const righeValide = WISC_IV_CAMPI.filter(c => punteggi[c.key])
  if (righeValide.length === 0) return ''

  let md = '| WISC-IV scale | Indici/QI | Categoria descrittiva | Interpretabilità |\n'
  md +=    '|---|---|---|---|\n'
  for (const c of righeValide) {
    const val = punteggi[c.key]
    md += `| ${c.label} | ${val} | ${fasciaWISC(val)} | Sì |\n`
  }
  return md
}

export function notaRangeWisc() {
  return '*WISC-IV: QI >129 molto superiore, 120-129 superiore, 110-119 medio-superiore, 90-109 media, 80-89 media inferiore, 70-79 inferiore alla media, <69 molto inferiore alla norma.*'
}

// Testo narrativo per gli indici WISC compilati — frase-cornice fissa + fascia calcolata
export function wiscToNarrativa(punteggi, riferimentiSubtest = '') {
  const base = WISC_IV_CAMPI
    .filter(c => punteggi[c.key] && c.tipo !== 'totale')
    .map(c => `${c.descr} Il punteggio ottenuto (${punteggi[c.key]}) si colloca nella fascia "${fasciaWISC(punteggi[c.key])}".`)
    .join(' ')

  let rif = ''

  if (typeof riferimentiSubtest === 'string') {
    rif = riferimentiSubtest.trim()
  } else if (riferimentiSubtest && typeof riferimentiSubtest === 'object') {
    const mapping = [
      ['icv', 'ICV'],
      ['rp', 'RP/IRP'],
      ['iml', 'IML/ML'],
      ['ve', 'VE/IVE'],
    ]
    rif = mapping
      .map(([key, label]) => {
        const value = String(riferimentiSubtest[key] || '').trim()
        return value ? `${label}: ${value}` : ''
      })
      .filter(Boolean)
      .join('; ')
  }

  if (!rif) return base

  return [base, `Riferimenti ai subtest: ${rif}.`].filter(Boolean).join(' ')
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

export function assemblaDocumentoMarkdown(wizard, narrativaPerSezione = {}) {
  const sez = wizard.sezioni_attive || []
  let out = '# Relazione di Valutazione Neuropsicologica\n\n'
  out += '## Dati e motivo dell\'invio\n'
  out += `Il/la paziente viene inviato/a da ${wizard.tipo_invio || '[inviante]'} per ${wizard.motivo_invio || 'valutazione neuropsicologica'}.\n`

  if (sez.includes('anamnesi')) {
    out += '\n## Anamnesi\n'
    if (wizard.anamnesi) {
      const remota = anamnesiRemotaToTesto(wizard.anamnesi)
      const recente = anamnesiRecenteToTesto(wizard.anamnesi)
      if (remota) out += `Anamnesi remota: ${remota} `
      if (recente) out += `Situazione attuale: ${recente}`
      out += '\n'
    }
  }

  if (sez.includes('osservazione')) {
    out += '\n## Osservazione comportamentale\n'
    const oss = osservazioneToTesto(wizard.osservazione)
    out += (oss || '') + '\n'
  }

  if (sez.includes('cognitivo')) {
    out += '\n## Valutazione cognitiva\n'
    if (wizard.cognitivo?.eta_valutazione) out += `Età al momento della valutazione: ${wizard.cognitivo.eta_valutazione}.\n`
    if (wizard.cognitivo?.strumenti_utilizzati) out += `Strumenti utilizzati: ${wizard.cognitivo.strumenti_utilizzati}\n`
    out += '\n'
    const wiscTabella = wiscToMarkdownTable(wizard.cognitivo.punteggi || {})
    if (wiscTabella) out += wiscTabella + '\n'
    if (wizard.cognitivo?.includi_nota_range) out += notaRangeWisc() + '\n'
    const narrativaC = rimuoviTabelleMarkdown(narrativaPerSezione['cognitivo'] || '')
    if (narrativaC) out += narrativaC + '\n'
    if (wizard.cognitivo?.note_cliniche) out += wizard.cognitivo.note_cliniche + '\n'
  }

  if (sez.includes('nepsy')) {
    out += '\n## Approfondimento neuropsicologico\n'
    if (wizard.nepsy?.strumenti_utilizzati) out += `Strumenti utilizzati: ${wizard.nepsy.strumenti_utilizzati}\n`
    out += '\n'
    const nepsyTabella = nepsyToMarkdownTable(wizard.nepsy.punteggi || {})
    if (nepsyTabella) out += nepsyTabella + '\n'
    if (wizard.nepsy?.includi_nota_range) out += notaRangeNepsy() + '\n'
    const narrativaN = rimuoviTabelleMarkdown(narrativaPerSezione['nepsy'] || '')
    if (narrativaN) out += narrativaN + '\n'
    if (wizard.nepsy?.note_cliniche) out += wizard.nepsy.note_cliniche + '\n'
  }

  if (sez.includes('apprendimenti')) {
    out += '\n## Valutazione apprendimenti\n'
    if (wizard.apprendimenti?.strumenti) out += `${wizard.apprendimenti.strumenti}\n\n`
    if (wizard.apprendimenti?.punteggi_grezzi) out += `${wizard.apprendimenti.punteggi_grezzi}\n\n`
    // Testo narrativo di Gemini (se presente) integra, non sostituisce,
    // i campi lettura/scrittura/matematica inseriti manualmente.
    const narrativaApp = rimuoviTabelleMarkdown(narrativaPerSezione['apprendimenti'] || '')
    if (narrativaApp) out += narrativaApp + '\n'
    const parti = [wizard.apprendimenti?.lettura, wizard.apprendimenti?.scrittura, wizard.apprendimenti?.matematica].filter(Boolean)
    if (parti.length) out += parti.join(' ') + '\n'
  }

  if (sez.includes('questionari')) {
    out += '\n## Questionari\n'
    if (wizard.questionari?.tipo) out += `${wizard.questionari.tipo}\n\n`
    if (wizard.questionari?.punteggi_grezzi) out += `${wizard.questionari.punteggi_grezzi}\n\n`
    const narrativaQ = rimuoviTabelleMarkdown(narrativaPerSezione['questionari'] || '')
    if (narrativaQ) out += narrativaQ + '\n'
    if (wizard.questionari?.note_cliniche) out += wizard.questionari.note_cliniche + '\n'
  }

  if (sez.includes('conclusioni')) {
    out += '\n## Conclusioni\n'
    // Il testo narrativo di Gemini (sintesi articolata del quadro
    // complessivo, vedi generaNarrativaSezioni) viene anteposto al
    // template fisso di diagnosi/consigli — prima era generato ma mai
    // usato, il che contribuiva a relazioni percepite come "scarne"
    // anche quando Gemini aveva prodotto un'analisi ricca.
    const narrativaConcl = rimuoviTabelleMarkdown(narrativaPerSezione['conclusioni'] || '')
    if (narrativaConcl) out += narrativaConcl + '\n\n'
    if (wizard.conclusioni?.diagnosi) {
      out += `Alla luce di quanto emerso dalla valutazione, si rileva ${wizard.conclusioni.diagnosi}`
      if (wizard.conclusioni?.codice_icd) out += ` (${wizard.conclusioni.codice_icd})`
      out += '.\n\n'
    }
    if (wizard.conclusioni?.consigli_paziente) out += `Consigli: ${wizard.conclusioni.consigli_paziente}\n`
    if (wizard.conclusioni?.consigli_scuola) out += `Indicazioni per la scuola: ${wizard.conclusioni.consigli_scuola}\n`
    if (wizard.conclusioni?.strumenti_compensativi) out += `Strumenti compensativi: ${wizard.conclusioni.strumenti_compensativi}\n`
    if (wizard.conclusioni?.misure_dispensative) out += `Misure dispensative: ${wizard.conclusioni.misure_dispensative}\n`
    out += '\nSi rilascia alla famiglia per gli usi consentiti dalla Legge 170/2010.\n'
  }

  return rimuoviTabelleDuplicateDalDocumento(out.trim())
}
