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
  const pp = cognitivo.subtest_pp
  if (!pp || typeof pp !== 'object') return false

  return Object.values(pp).some(v => String(v ?? '').trim().length > 0)
}
