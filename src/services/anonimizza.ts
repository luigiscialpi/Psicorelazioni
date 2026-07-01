import type { AnagraficaPaziente, UnknownRecord } from '../core/types'

function escapeRegExp(value: unknown) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sostituisciNomeCompleto(testo: string, nome: string, cognome: string) {
  if (!nome || !cognome) return testo
  const tokens = `${nome} ${cognome}`.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return testo
  const re = new RegExp(tokens.map(escapeRegExp).join('[ \\t]+'), 'gi')
  return testo.replace(re, '[PAZIENTE]')
}

function sostituisciParolaIsolata(testo: string, parola: string) {
  if (!parola || !parola.trim()) return testo
  const p = parola.trim()
  const re = new RegExp(`(^|[^A-Za-zÀ-ÖØ-öø-ÿ'])(${escapeRegExp(p)})(?=$|[^A-Za-zÀ-ÖØ-öø-ÿ'])`, 'gi')
  return testo.replace(re, '$1[PAZIENTE]')
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function estraiPaziente(metadatiRelazione: unknown): AnagraficaPaziente {
  if (!isRecord(metadatiRelazione)) return {}
  const paziente = isRecord(metadatiRelazione.paziente) ? metadatiRelazione.paziente : metadatiRelazione
  return {
    nome: getString(paziente.nome),
    cognome: getString(paziente.cognome),
  }
}

export function anonimizzaTesto(testoMarkdown: unknown, metadatiRelazione: unknown = {}) {
  let testo = String(testoMarkdown || '')
  const paziente = estraiPaziente(metadatiRelazione)
  const nome = paziente?.nome || ''
  const cognome = paziente?.cognome || ''

  // 1) Sostituzione nomi paziente da metadati noti
  testo = sostituisciNomeCompleto(testo, nome, cognome)
  testo = sostituisciParolaIsolata(testo, nome)
  testo = sostituisciParolaIsolata(testo, cognome)

  // 1b) Nome paziente nel testo libero: "Nome Cognome, nato/a il ..."
  testo = testo.replace(
     /(^|[\n\r]\s*|[.!?]\s+)([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:[ \t]+(?:[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+|de|di|del|della|dello|da|de[ \t]+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+)){1,3})(\s*,?\s*nat[oa]\s+(?:il\s+)?(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\[DATA\]))/gim,
    '$1[PAZIENTE]$3'
  )

  // 2) Date di nascita dopo "nato/nata (il)"
  testo = testo.replace(
     /(\bnat[oa]\s+(?:il\s+)?)(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b/gi,
    '$1[DATA]'
  )

  // 2b) Nominativi di specialisti/professionisti con titolo
  testo = testo.replace(
    /(\b(?:dott\.ssa|dott\.|dr\.ssa|dr\.|prof\.ssa|prof\.)\s+)([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:[ \t]+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,3})/gi,
    '$1[PERSONA]'
  )

  // 3) Telefono dopo prefissi espliciti (Cell./Tel.)
  testo = testo.replace(
    /(\b(?:cell\.?|tel\.?)\s*:?\s*)(?:\+?\d{1,3}[\s.]*)?(?:\d[\s.]*){8,11}\d\b/gi,
    '$1[TELEFONO]'
  )

  // 4) Telefono generico (9-10 cifre, con spazi/punti opzionali)
  testo = testo.replace(
    /\b(?:\+?39[\s.]*)?(?:\d[\s.]*){8,9}\d\b/g,
    '[TELEFONO]'
  )

  // 5) Partita IVA dopo P.IVA/P. IVA
  testo = testo.replace(
    /(\bP\.?\s*IVA\.?\s*:?\s*)\d{11}\b/gi,
    '$1[PIVA]'
  )

  // 6) Codice fiscale italiano (16 caratteri)
  testo = testo.replace(
    /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/gi,
    '[CF]'
  )

  // 7) Indirizzi tipici (via/piazza/p.zza/viale/corso ... numero)
  testo = testo.replace(
    /\b(?:via|viale|piazza|p\.?zza|corso)\s+[A-Za-zÀ-ÖØ-öø-ÿ'’.\s]{2,80}?\s*(?:,\s*|\s+)(?:n\.?\s*)?\d+[A-Za-z]?\b/gi,
    '[INDIRIZZO]'
  )

  // 8) Nomi di scuole/istituti in forma narrativa
  testo = testo.replace(
    /\b(?:Istituto(?:\s+Professionale)?|Liceo|Scuola)\b[^\n.,;:]{0,80}/gi,
    '[SCUOLA]'
  )

  return testo
}
