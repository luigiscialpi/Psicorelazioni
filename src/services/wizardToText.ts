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
    const narrativaC = narrativaPerSezione['cognitivo'] || ''
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
    const narrativaN = narrativaPerSezione['nepsy'] || ''
    if (narrativaN) out += narrativaN + '\n'
    if (wizard.nepsy?.note_cliniche) out += wizard.nepsy.note_cliniche + '\n'
  }

  if (sez.includes('apprendimenti')) {
    out += '\n## Valutazione apprendimenti\n'
    if (wizard.apprendimenti?.strumenti) out += `${wizard.apprendimenti.strumenti}\n\n`
    if (wizard.apprendimenti?.punteggi_grezzi) out += `${wizard.apprendimenti.punteggi_grezzi}\n\n`
    const parti = [wizard.apprendimenti?.lettura, wizard.apprendimenti?.scrittura, wizard.apprendimenti?.matematica].filter(Boolean)
    if (parti.length) out += parti.join(' ') + '\n'
  }

  if (sez.includes('questionari')) {
    out += '\n## Questionari\n'
    if (wizard.questionari?.tipo) out += `${wizard.questionari.tipo}\n\n`
    if (wizard.questionari?.punteggi_grezzi) out += `${wizard.questionari.punteggi_grezzi}\n\n`
    if (wizard.questionari?.note_cliniche) out += wizard.questionari.note_cliniche + '\n'
  }

  if (sez.includes('conclusioni')) {
    out += '\n## Conclusioni\n'
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

  return out.trim()
}
