import { describe, it, expect, vi } from 'vitest'
// Mock supabase to avoid WebSocket initialization error in Node.js test environment
vi.mock('../core/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}))
import { calcolaFascia, generaTabella, generaNarrativa, generaSezioneTest, valutaFormule, migraWizardSnapshotLegacy, buildGeminiPayload } from './testTemplateEngine'
import { MOCK_WISC_IV_TEMPLATE, MOCK_NEPSY_II_TEMPLATE } from '../data/mockTemplates'
import type { RisultatoTest, TestTemplate } from '../core/testTemplate'
import { rilevaNomiTestDaProfilo, generaTemplateTest } from './geminiService'

describe('testTemplateEngine', () => {

  describe('valutaFormule', () => {
    it('calcola correttamente formule semplici e complesse', () => {
      const templateMock: TestTemplate = {
        id: 'test-formule',
        nome: 'Test Formule',
        categoria: 'altro',
        scalaDefault: { tipo: 'scalare' },
        campiPrincipali: [
          { key: 'a', label: 'Campo A' },
          { key: 'b', label: 'Campo B' },
          { key: 'somma', label: 'Somma' },
          { key: 'media', label: 'Media' },
        ],
        formule: [
          { targetKey: 'somma', espressione: '{a} + {b}' },
          { targetKey: 'media', espressione: '({somma}) / 2' }
        ],
        colonne: ['Punteggio'],
        schemaVersion: 1,
        builtIn: false,
        attivo: true,
        richiedeEtaValutazione: false,
        richiedeStrumentiUtilizzati: false
      }

      const risultato: RisultatoTest = {
        punteggi: { a: '10', b: '20' }
      }

      const punteggiCalcolati = valutaFormule(templateMock, risultato)
      expect(punteggiCalcolati.somma).toBe(30)
      expect(punteggiCalcolati.media).toBe(15)
    })
  })

  describe('migraWizardSnapshotLegacy', () => {
    it('converte correttamente il formato legacy in test_risultati', () => {
      const legacyWizard = {
        sezioni_attive: ['cognitivo', 'nepsy'],
        cognitivo: {
          somministrato: true,
          punteggi: { icv: '100' },
          subtest_pp: { so: '10' },
          interpretabilita: { icv: true },
          eta_valutazione: '8 anni',
          strumenti_utilizzati: 'WISC-IV',
          note_cliniche: 'Leggera stanchezza.'
        },
        nepsy: {
          somministrato: true,
          punteggi: { inibizione: '8' },
          strumenti_utilizzati: 'NEPSY-II',
          note_cliniche: 'Collaborativo.'
        }
      }

      const migrated = migraWizardSnapshotLegacy(legacyWizard)

      expect(migrated.sezioni_attive).toContain('wisc-iv')
      expect(migrated.sezioni_attive).toContain('nepsy-ii')
      expect(migrated.test_risultati['wisc-iv'].punteggi.icv).toBe('100')
      expect(migrated.test_risultati['wisc-iv'].punteggiSecondari.so).toBe('10')
      expect(migrated.test_risultati['wisc-iv'].etaValutazione).toBe('8 anni')
      expect(migrated.test_risultati['nepsy-ii'].punteggi.inibizione).toBe('8')
      expect(migrated.test_risultati['nepsy-ii'].noteCliniche).toBe('Collaborativo.')
      expect(migrated.cognitivo).toBeUndefined()
      expect(migrated.nepsy).toBeUndefined()
    })
  })

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

  describe('buildGeminiPayload', () => {
    const risultatoMock: RisultatoTest = {
      somministrato: true,
      strumentiUtilizzati: 'WISC-IV',
      punteggi: { icv: '108', rp: '95', iml: '88', ve: '91', qit: '95' },
      punteggiSecondari: { so: '11', vc: '12', co: '10', dc: '9' },
      interpretabilita: { icv: true, rp: true, iml: false, ve: true, qit: true },
      includiNotaRange: true,
      noteCliniche: 'Paziente molto collaborativo.'
    }

    it('non contiene sintassi di tabella Markdown (nessuna riga con "|")', () => {
      const payload = buildGeminiPayload(MOCK_WISC_IV_TEMPLATE, risultatoMock)
      expect(payload).not.toContain('|')
      expect(payload).not.toContain('---')
    })

    it('riporta i punteggi come dati semplici label/valore/fascia', () => {
      const payload = buildGeminiPayload(MOCK_WISC_IV_TEMPLATE, risultatoMock)
      expect(payload).toContain('Comprensione Verbale (ICV): 108, fascia Media')
      expect(payload).toContain('Memoria di Lavoro (IML): 88, fascia Media inferiore (NON interpretabile: dispersione eccessiva nei subtest)')
    })

    it('spoglia la nota range dagli asterischi di formattazione', () => {
      const payload = buildGeminiPayload(MOCK_WISC_IV_TEMPLATE, risultatoMock)
      expect(payload).toContain('Criterio interpretativo di riferimento (usa per informare il commento, NON citarlo testualmente né riprodurlo come nota a parte): WISC-IV: QI >129')
      expect(payload).not.toContain('*WISC-IV')
    })

    it('mantiene comunque il marcatore di sezione per il parsing a valle', () => {
      const payload = buildGeminiPayload(MOCK_WISC_IV_TEMPLATE, risultatoMock)
      expect(payload).toMatch(/^=== SEZIONE: wisc-iv ===/)
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

  describe('estrazione test on-demand da profilo', () => {
    it('rilevaNomiTestDaProfilo individua i test non registrati', async () => {
      const rilevati = await rilevaNomiTestDaProfilo('test', ['BVSCO-3'])
      expect(rilevati.length).toBe(2)
      expect(rilevati[0].nome).toBe('AC-MT')

      const tuttiEsistenti = await rilevaNomiTestDaProfilo('test', ['BVSCO-3', 'AC-MT', 'APL Medea'])
      expect(tuttiEsistenti.length).toBe(0)
    })

    it('generaTemplateTest estrae il template di un test specifico', async () => {
      const t = await generaTemplateTest('BVSCO-3', 'test')
      expect(t.nome).toBe('BVSCO-3')
      expect(t.categoria).toBe('apprendimenti')
      expect(t.campiPrincipali.length).toBe(3)
    })
  })
})
