import { describe, it, expect } from 'vitest'
import { calcolaFascia, generaTabella, generaNarrativa, generaSezioneTest } from './testTemplateEngine'
import { MOCK_WISC_IV_TEMPLATE, MOCK_NEPSY_II_TEMPLATE } from '../data/mockTemplates'
import type { RisultatoTest } from '../core/testTemplate'

describe('testTemplateEngine', () => {

  describe('calcolaFascia', () => {
    it('calcola correttamente fasce WISC', () => {
      expect(calcolaFascia(135, { tipo: 'qi_wisc' })).toBe('Molto superiore')
      expect(calcolaFascia(100, { tipo: 'qi_wisc' })).toBe('Media')
      expect(calcolaFascia(65, { tipo: 'qi_wisc' })).toBe('Molto inferiore alla norma')
    })

    it('calcola correttamente fasce scalari', () => {
      expect(calcolaFascia(14, { tipo: 'scalare' })).toBe('Sopra la norma')
      expect(calcolaFascia(10, { tipo: 'scalare' })).toBe('Nella norma')
      expect(calcolaFascia(6, { tipo: 'scalare' })).toBe('Al limite')
      expect(calcolaFascia(3, { tipo: 'scalare' })).toBe('Sotto la norma')
    })

    it('calcola correttamente fasce custom', () => {
      const scalaCustom = {
        tipo: 'soglie_custom' as const,
        soglie: [
          { min: 0, max: 10, etichetta: 'Deficitario' },
          { min: 11, max: null, etichetta: 'Adeguato' }
        ]
      }
      expect(calcolaFascia(5, scalaCustom)).toBe('Deficitario')
      expect(calcolaFascia(15, scalaCustom)).toBe('Adeguato')
      expect(calcolaFascia(10.5, scalaCustom)).toBe('Fuori range') // Cade nel gap
    })
  })

  describe('WISC-IV Template', () => {
    const risultatoMock: RisultatoTest = {
      somministrato: true,
      strumentiUtilizzati: 'WISC-IV',
      punteggi: { icv: '108', rp: '95', iml: '88', ve: '91', qit: '95' },
      punteggiSecondari: { so: '11', vc: '12', co: '10', dc: '9' },
      interpretabilita: { icv: true, rp: true, iml: false, ve: true, qit: true },
      includiNotaRange: true,
      noteCliniche: 'Paziente molto collaborativo.'
    }

    it('generaTabella produce la tabella corretta con sottotest', () => {
      const table = generaTabella(MOCK_WISC_IV_TEMPLATE, risultatoMock)
      expect(table).toContain('| Comprensione Verbale (ICV) | 108 | Media | Sì |')
      expect(table).toContain('| Memoria di Lavoro (IML) | 88 | Media inferiore | No |')
      expect(table).toContain('**Comprensione Verbale (ICV)**')
      expect(table).toContain('| Somiglianze (SO) | 11 |')
    })

    it('generaNarrativa produce la narrativa corretta gestendo interpretabilità', () => {
      const narrazione = generaNarrativa(MOCK_WISC_IV_TEMPLATE, risultatoMock)
      expect(narrazione).toContain('Il punteggio ottenuto (108) si colloca nella fascia "Media".')
      expect(narrazione).toContain('Il punteggio ottenuto (88) NON risulta interpretabile a causa dell\'eccessiva dispersione dei punteggi nei subtest.')
      expect(narrazione).toContain('**Note Cliniche:**\nPaziente molto collaborativo.')
    })
    
    it('generaSezioneTest assembla tutto correttamente', () => {
      const testo = generaSezioneTest(MOCK_WISC_IV_TEMPLATE, risultatoMock)
      expect(testo).toContain('## Valutazione cognitiva')
      expect(testo).toContain('Strumenti utilizzati: WISC-IV.')
      expect(testo).toContain('*WISC-IV: QI >129')
    })
  })

  describe('NEPSY-II Template', () => {
    const risultatoMock: RisultatoTest = {
      somministrato: true,
      punteggi: { attenzione_uditiva: '7', inibizione: '6' },
      includiNotaRange: false
    }

    it('generaTabella produce la tabella corretta con punteggi scalari', () => {
      const table = generaTabella(MOCK_NEPSY_II_TEMPLATE, risultatoMock)
      expect(table).toContain('| Attenzione Uditiva (Attenzione e Funzioni Esecutive) | 7 | Al limite | Sì |')
      expect(table).toContain('| Inibizione (Attenzione e Funzioni Esecutive) | 6 | Al limite | Sì |')
    })

    it('generaSezioneTest non include nota range se disabilitata', () => {
      const testo = generaSezioneTest(MOCK_NEPSY_II_TEMPLATE, risultatoMock)
      expect(testo).not.toContain('*NEPSY-II: punteggi scalari')
    })
  })
})
