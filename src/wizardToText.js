// ============================================================
// WIZARD → TESTO — trasforma le strutture dati del wizard
// (voci checkbox selezionate, punteggi numerici) in testo/tabelle
// pronte da passare a Gemini o da inserire nel DOCX finale.
// Centralizzato qui per essere condiviso tra geminiService.js
// e exportDocx.js senza duplicare la logica.
// ============================================================

import {
  ANAMNESI_REMOTA_VOCI, ANAMNESI_RECENTE_VOCI,
  OSSERVAZIONE_ADATTAMENTO_VOCI, OSSERVAZIONE_ATTEGGIAMENTO_VOCI,
} from './anamnesiVoci'
import { WISC_IV_CAMPI, NEPSY_II_DOMINI, fasciaWISC, fasciaScalare } from './testDefinitions'

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

// ── Tabella WISC-IV in Markdown, pronta per Gemini e per il parser di exportDocx.js ──
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

// Testo narrativo per gli indici WISC compilati — frase-cornice fissa + fascia calcolata
export function wiscToNarrativa(punteggi) {
  return WISC_IV_CAMPI
    .filter(c => punteggi[c.key] && c.tipo !== 'totale')
    .map(c => `${c.descr} Il punteggio ottenuto (${punteggi[c.key]}) si colloca nella fascia "${fasciaWISC(punteggi[c.key])}".`)
    .join(' ')
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
