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

  it('non richiede i campi gestiti dall\'app (id, builtIn, attivo, colonne, formule)', () => {
    // GeneratedTestTemplateSchema deriva da .omit(): questi campi non devono
    // essere nella forma, altrimenti generaTemplateTest chiederebbe a Gemini
    // di inventare id/flag che dovrebbero restare responsabilità del codice.
    const shape = GeneratedTestTemplateSchema.shape as Record<string, unknown>
    expect(shape.id).toBeUndefined()
    expect(shape.builtIn).toBeUndefined()
    expect(shape.attivo).toBeUndefined()
    expect(shape.colonne).toBeUndefined()
    expect(shape.formule).toBeUndefined()
  })

  it('è convertibile in JSON Schema (stesso percorso usato da callGeminiStructured)', () => {
    // Se questa conversione lancia, ogni chiamata reale a generaTemplateTest
    // fallirebbe prima ancora di contattare l'API: meglio scoprirlo qui.
    expect(() => z.toJSONSchema(GeneratedTestTemplateSchema, { target: 'openapi-3.0' })).not.toThrow()
    const jsonSchema = z.toJSONSchema(GeneratedTestTemplateSchema, { target: 'openapi-3.0' }) as { required?: string[] }
    expect(jsonSchema.required).not.toContain('id')
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
