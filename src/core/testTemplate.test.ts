import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { GeneratedTestTemplateSchema, TestTemplateSchema, CategoriaTestSchema } from './testTemplate'

describe('GeneratedTestTemplateSchema', () => {
  const validoBase = {
    nome: 'BVSCO-3',
    categoria: 'apprendimenti' as const,
    scalaDefault: {
      tipo: 'soglie_custom' as const,
      soglie: [
        { min: 0, max: 4, etichetta: 'Richiesta di Intervento' },
        { min: 5, max: null, etichetta: 'Sufficiente' },
      ],
    },
    campiPrincipali: [
      { key: 'dettato_brano', label: 'Dettato di brano', descr: 'Ortografia generale' },
    ],
  }

  it('accetta un oggetto valido con scalaDefault a soglie_custom', () => {
    const risultato = GeneratedTestTemplateSchema.parse(validoBase)
    expect(risultato.nome).toBe('BVSCO-3')
    expect(risultato.scalaDefault.tipo).toBe('soglie_custom')
  })

  it('accetta scalaDefault "scalare" senza il campo soglie', () => {
    const risultato = GeneratedTestTemplateSchema.parse({ ...validoBase, scalaDefault: { tipo: 'scalare' } })
    expect(risultato.scalaDefault.tipo).toBe('scalare')
  })

  it('rifiuta un oggetto senza campiPrincipali', () => {
    const { campiPrincipali: _campiPrincipali, ...senzaCampi } = validoBase
    expect(() => GeneratedTestTemplateSchema.parse(senzaCampi)).toThrow()
  })

  it('rifiuta una categoria fuori enum', () => {
    expect(() => GeneratedTestTemplateSchema.parse({ ...validoBase, categoria: 'inventata' })).toThrow()
  })

  it('non richiede i campi gestiti dall\'app (id, builtIn, attivo, formule)', () => {
    // GeneratedTestTemplateSchema deriva da .omit(): questi campi non devono
    // essere nella forma, altrimenti generaTemplateTest chiederebbe a Gemini
    // di inventare id/flag che dovrebbero restare responsabilità del codice.
    const shape = GeneratedTestTemplateSchema.shape as Record<string, unknown>
    expect(shape.id).toBeUndefined()
    expect(shape.builtIn).toBeUndefined()
    expect(shape.attivo).toBeUndefined()
    expect(shape.formule).toBeUndefined()
  })

  it('accetta colonne come semplice array di nomi (mai il range/scala)', () => {
    // Le colonne sono reintrodotte in GeneratedTestTemplateSchema ma semplificate:
    // l'LLM può suggerire i NOMI delle colonne (es. 'Punti T', 'Percentile'), mai
    // il range/scala di ciascuna, che resta sempre configurazione manuale.
    const risultato = GeneratedTestTemplateSchema.parse({ ...validoBase, colonne: ['Punti T', 'Percentile'] })
    expect(risultato.colonne).toEqual(['Punti T', 'Percentile'])
  })

  it('funziona anche senza colonne (opzionale)', () => {
    const risultato = GeneratedTestTemplateSchema.parse(validoBase)
    expect(risultato.colonne).toBeUndefined()
  })

  it('è convertibile in JSON Schema (stesso percorso usato da callGeminiStructured)', () => {
    // Se questa conversione lancia, ogni chiamata reale a generaTemplateTest
    // fallirebbe prima ancora di contattare l'API: meglio scoprirlo qui.
    expect(() => z.toJSONSchema(GeneratedTestTemplateSchema, { target: 'openapi-3.0' })).not.toThrow()
    const jsonSchema = z.toJSONSchema(GeneratedTestTemplateSchema, { target: 'openapi-3.0' }) as { required?: string[] }
    expect(jsonSchema.required).not.toContain('id')
  })
})

describe('TestTemplateSchema.colonne', () => {
  const base = {
    id: 'test-1',
    nome: 'Test Custom',
    categoria: 'altro' as const,
    scalaDefault: { tipo: 'scalare' as const },
    campiPrincipali: [{ key: 'indice', label: 'Indice' }],
  }

  it('di default vale [{ nome: "Punteggio" }] se assente', () => {
    const risultato = TestTemplateSchema.parse(base)
    expect(risultato.colonne).toEqual([{ nome: 'Punteggio' }])
  })

  it('normalizza le vecchie colonne salvate come stringa semplice', () => {
    // Retrocompatibilità con i template esistenti in Supabase (built-in e custom),
    // salvati prima dell'introduzione del range per colonna.
    const risultato = TestTemplateSchema.parse({ ...base, colonne: ['Punteggio', 'Percentile'] })
    expect(risultato.colonne).toEqual([{ nome: 'Punteggio' }, { nome: 'Percentile' }])
  })

  it('accetta una colonna con range/scala propria', () => {
    const risultato = TestTemplateSchema.parse({
      ...base,
      colonne: [
        { nome: 'Punti T', scala: { tipo: 'qi_wisc' } },
        'Percentile',
      ],
    })
    expect(risultato.colonne).toEqual([
      { nome: 'Punti T', scala: { tipo: 'qi_wisc' } },
      { nome: 'Percentile' },
    ])
  })

  it('rifiuta una colonna con nome vuoto', () => {
    expect(() => TestTemplateSchema.parse({ ...base, colonne: [''] })).toThrow()
  })
})

describe('CategoriaTestSchema', () => {
  it('accetta tutte le categorie note', () => {
    for (const categoria of ['cognitivo', 'nepsy', 'apprendimenti', 'questionari', 'altro']) {
      expect(() => CategoriaTestSchema.parse(categoria)).not.toThrow()
    }
  })

  it('è la stessa fonte usata dal campo categoria di TestTemplateSchema', () => {
    // Evita che le due enum tornino a divergere in futuro (com'era prima:
    // l'enum categoria era ridefinita inline dentro TestTemplateSchema).
    expect(TestTemplateSchema.shape.categoria).toBe(CategoriaTestSchema)
  })
})
