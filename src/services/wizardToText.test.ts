import { describe, it, expect } from 'vitest'
import { convertiMarcatoriSottosezione, assemblaDocumentoMarkdown, titoloSezioneTest } from './wizardToText'
import type { TestTemplate, RisultatoTest } from '../core/testTemplate'

describe('convertiMarcatoriSottosezione', () => {
  it('converte un marcatore singolo in un sotto-titolo in grassetto', () => {
    const testo = 'Testo prima.\n=== SOTTOSEZIONE: Raccomandazioni ===\nTesto dopo.'
    const risultato = convertiMarcatoriSottosezione(testo)
    expect(risultato).toContain('**Raccomandazioni**')
    expect(risultato).not.toContain('===')
  })

  it('converte più marcatori nello stesso testo (caso reale: Conclusioni + Raccomandazioni)', () => {
    const testo = '=== SOTTOSEZIONE: Conclusioni ===\nDiagnosi qui.\n=== SOTTOSEZIONE: Raccomandazioni ===\nConsigli qui.'
    const risultato = convertiMarcatoriSottosezione(testo)
    expect(risultato).toContain('**Conclusioni**')
    expect(risultato).toContain('**Raccomandazioni**')
    expect(risultato).not.toContain('===')
  })

  it('gestisce la variante con backslash iniziale (come vista in un documento reale)', () => {
    const testo = 'Testo.\n\\=== SOTTOSEZIONE: Raccomandazioni ===\nAltro testo.'
    const risultato = convertiMarcatoriSottosezione(testo)
    expect(risultato).toContain('**Raccomandazioni**')
    expect(risultato).not.toContain('===')
    expect(risultato).not.toContain('\\')
  })

  it('non tocca un testo senza marcatori', () => {
    const testo = 'Testo normale senza nulla di speciale.'
    expect(convertiMarcatoriSottosezione(testo)).toBe(testo)
  })

  it('gestisce stringa vuota senza errori', () => {
    expect(convertiMarcatoriSottosezione('')).toBe('')
  })
})

describe('titoloSezioneTest', () => {
  it('usa l\'etichetta generica solo per i due built-in singoli', () => {
    expect(titoloSezioneTest({ id: 'wisc-iv', categoria: 'cognitivo', nome: 'WISC-IV' })).toBe('Valutazione cognitiva')
    expect(titoloSezioneTest({ id: 'nepsy-ii', categoria: 'nepsy', nome: 'NEPSY-II' })).toBe('Approfondimento neuropsicologico')
  })

  it('usa sempre il nome specifico per i test dinamici, mai un\'etichetta generica di categoria', () => {
    expect(titoloSezioneTest({ id: 'uuid-1', categoria: 'questionari', nome: 'CBCL 6-18' })).toBe('CBCL 6-18')
    expect(titoloSezioneTest({ id: 'uuid-2', categoria: 'apprendimenti', nome: 'BVSCO-3' })).toBe('BVSCO-3')
  })

  it('due template diversi con la stessa categoria producono titoli diversi (niente collisione)', () => {
    const cbcl = titoloSezioneTest({ id: 'uuid-1', categoria: 'questionari', nome: 'CBCL 6-18' })
    const sdq = titoloSezioneTest({ id: 'uuid-2', categoria: 'questionari', nome: 'SDQ' })
    expect(cbcl).not.toBe(sdq)
  })
})

describe('assemblaDocumentoMarkdown — dedup test dinamici vs sezioni legacy', () => {
  const templateQuestionarioCustom: TestTemplate = {
    id: 'cbcl-uuid-test',
    nome: 'CBCL 6-18',
    categoria: 'questionari',
    scalaDefault: { tipo: 'soglie_custom', soglie: [{ min: 0, max: 65, etichetta: 'Norma' }] },
    campiPrincipali: [{ key: 'totale', label: 'Totale' }],
    richiedeEtaValutazione: false,
    richiedeStrumentiUtilizzati: false,
    builtIn: false,
    attivo: true,
    schemaVersion: 1,
    colonne: [{ nome: 'Punteggio' }],
  }

  const risultatoQuestionarioCustom: RisultatoTest = {
    somministrato: true,
    punteggi: { totale: '67' },
  }

  it('mostra il test dinamico (col suo nome) una sola volta, ignorando il campo legacy "questionari" compilato in aggiunta', () => {
    const wizard = {
      sezioni_attive: ['cbcl-uuid-test', 'questionari'],
      test_risultati: { 'cbcl-uuid-test': risultatoQuestionarioCustom },
      questionari: { tipo: 'cbcl', punteggi_grezzi: 'internalizzante e esternalizzante sopra soglia' },
    }
    const md = assemblaDocumentoMarkdown(wizard, {}, [templateQuestionarioCustom])
    const occorrenze = md.split('## CBCL 6-18').length - 1
    expect(occorrenze).toBe(1)
    // il contenuto mostrato deve essere quello del test dinamico (tabella coi punteggi reali),
    // non l'eco grezza dei campi legacy, e non deve comparire più un generico "## Questionari"
    expect(md).not.toContain('internalizzante e esternalizzante sopra soglia')
    expect(md).not.toContain('## Questionari')
  })

  it('due test dinamici diversi con la stessa categoria (es. due questionari) restano distinti, nessuno sovrascrive l\'altro', () => {
    const secondoQuestionario: TestTemplate = {
      ...templateQuestionarioCustom,
      id: 'sdq-uuid-test',
      nome: 'SDQ',
    }
    const wizard = {
      sezioni_attive: ['cbcl-uuid-test', 'sdq-uuid-test'],
      test_risultati: {
        'cbcl-uuid-test': risultatoQuestionarioCustom,
        'sdq-uuid-test': { somministrato: true, punteggi: { totale: '12' } },
      },
    }
    const md = assemblaDocumentoMarkdown(wizard, {}, [templateQuestionarioCustom, secondoQuestionario])
    expect(md).toContain('## CBCL 6-18')
    expect(md).toContain('## SDQ')
    // le due tabelle non devono fondersi in un'unica sezione "## Questionari"
    expect(md).not.toContain('## Questionari')
  })

  it('mostra comunque la sezione "Questionari" legacy se non esiste un test dinamico corrispondente', () => {
    const wizard = {
      sezioni_attive: ['questionari'],
      questionari: { tipo: 'altro questionario', punteggi_grezzi: 'dati grezzi qui' },
    }
    const md = assemblaDocumentoMarkdown(wizard, {}, [])
    expect(md).toContain('## Questionari')
    expect(md).toContain('dati grezzi qui')
  })

  it('applica la stessa dedup a "Valutazione apprendimenti"', () => {
    const templateApprendimenti: TestTemplate = {
      ...templateQuestionarioCustom,
      id: 'bvsco-uuid-test',
      nome: 'BVSCO-3',
      categoria: 'apprendimenti',
    }
    const wizard = {
      sezioni_attive: ['bvsco-uuid-test', 'apprendimenti'],
      test_risultati: { 'bvsco-uuid-test': risultatoQuestionarioCustom },
      apprendimenti: { strumenti: 'BVSCO-3', punteggi_grezzi: 'nota legacy da non duplicare' },
    }
    const md = assemblaDocumentoMarkdown(wizard, {}, [templateApprendimenti])
    const occorrenze = md.split('## BVSCO-3').length - 1
    expect(occorrenze).toBe(1)
    expect(md).not.toContain('nota legacy da non duplicare')
    expect(md).not.toContain('## Valutazione apprendimenti')
  })

  it('la sezione "Dati e motivo dell\'invio" compare sempre, anche senza narrativa Gemini né campi wizard compilati', () => {
    // Copre esplicitamente il caso di un blocco completamente vuoto: la sezione
    // deve comunque comparire con una frase di fallback, non sparire dal documento.
    const md = assemblaDocumentoMarkdown({ sezioni_attive: [] }, {})
    expect(md).toContain('## Dati e motivo dell\'invio')
  })
})
