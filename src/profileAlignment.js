export function estraiRequisitiDaProfilo(profiloMd) {
  const t = String(profiloMd || '')

  const richiedeRiferimentiSubtest = /riferiment[io][^\n]{0,80}subtest|co\s*pp\.?\s*\d+/i.test(t)
  const richiedeStrumenti = /strumenti\s+utilizzati/i.test(t)
  const richiedeEtaValutazione = /eta\s+del\s+paziente\s+al\s+momento\s+della\s+valutazione|età\s+del\s+paziente\s+al\s+momento\s+della\s+valutazione/i.test(t)
  const richiedeNoteRangeWisc = /nota\s+esplicativa[^\n]{0,80}range\s+qi|wisc\s*iv[^\n]{0,80}range/i.test(t)

  return {
    richiedeRiferimentiSubtest,
    richiedeStrumenti,
    richiedeEtaValutazione,
    richiedeNoteRangeWisc,
  }
}

export function haRiferimentiSubtestCompilati(cognitivo) {
  if (!cognitivo) return false
  const refs = cognitivo.riferimenti_subtest
  if (!refs) return false

  if (typeof refs === 'string') return refs.trim().length > 0

  if (typeof refs === 'object') {
    return Object.values(refs).some(v => String(v || '').trim().length > 0)
  }

  return false
}
