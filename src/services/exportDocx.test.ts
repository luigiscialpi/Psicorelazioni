import { describe, it, expect } from 'vitest'
import { parseInline, parseListItem, stripInlineMarkers } from './exportDocx'

describe('exportDocx — parsing inline/elenchi (introdotto per il RichTextEditor)', () => {

  describe('parseInline', () => {
    it('testo semplice senza marcatori resta un unico run', () => {
      const runs = parseInline('Testo semplice senza formattazione')
      expect(runs).toEqual([{ text: 'Testo semplice senza formattazione', bold: false, italics: false }])
    })

    it('riconosce il grassetto **...**', () => {
      const runs = parseInline('Prima **importante** dopo')
      expect(runs).toEqual([
        { text: 'Prima ', bold: false, italics: false },
        { text: 'importante', bold: true, italics: false },
        { text: ' dopo', bold: false, italics: false },
      ])
    })

    it('riconosce il corsivo *...* (coppia bilanciata)', () => {
      const runs = parseInline('Prima *importante* dopo')
      expect(runs).toEqual([
        { text: 'Prima ', bold: false, italics: false },
        { text: 'importante', bold: false, italics: true },
        { text: ' dopo', bold: false, italics: false },
      ])
    })

    it('gestisce grassetto e corsivo insieme sulla stessa riga', () => {
      const runs = parseInline('**Grassetto** e *corsivo* insieme')
      expect(runs).toEqual([
        { text: 'Grassetto', bold: true, italics: false },
        { text: ' e ', bold: false, italics: false },
        { text: 'corsivo', bold: false, italics: true },
        { text: ' insieme', bold: false, italics: false },
      ])
    })

    // Regressione: una relazione già archiviata prima di questa feature
    // può contenere un asterisco singolo isolato (es. una vecchia nota non
    // richiusa, o un asterisco usato come moltiplicazione/elenco legacy).
    // Non deve "accendere" il corsivo fino a fine riga — deve restare
    // testo letterale, esattamente come si comportava il parser originale.
    it('un asterisco singolo isolato (non bilanciato) resta testo letterale', () => {
      const runs = parseInline('Valore 5 * 3 senza chiusura')
      expect(runs).toEqual([{ text: 'Valore 5 * 3 senza chiusura', bold: false, italics: false }])
    })
  })

  describe('parseListItem', () => {
    it('riconosce un elenco puntato con "-"', () => {
      expect(parseListItem('- primo punto')).toEqual({ ordered: false, text: 'primo punto' })
    })

    it('riconosce un elenco puntato con "*"', () => {
      expect(parseListItem('* secondo punto')).toEqual({ ordered: false, text: 'secondo punto' })
    })

    it('riconosce un elenco numerato "1. "', () => {
      expect(parseListItem('1. primo punto')).toEqual({ ordered: true, text: 'primo punto' })
    })

    it('riconosce un elenco numerato con parentesi "2) "', () => {
      expect(parseListItem('2) secondo punto')).toEqual({ ordered: true, text: 'secondo punto' })
    })

    it('un paragrafo normale non è un elenco', () => {
      expect(parseListItem('Questo è un paragrafo normale.')).toBeNull()
    })
  })

  describe('stripInlineMarkers', () => {
    it('rimuove i marcatori ** e * lasciando solo il testo', () => {
      expect(stripInlineMarkers('Titolo **importante** e *corsivo*')).toBe('Titolo importante e corsivo')
    })

    it('non tocca un titolo senza marcatori', () => {
      expect(stripInlineMarkers('Valutazione cognitiva')).toBe('Valutazione cognitiva')
    })
  })
})
