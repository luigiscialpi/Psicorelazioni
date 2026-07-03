import { supabase } from '../core/supabase'
import { USE_MOCK } from '../core/config'
import { TestTemplateSchema, type TestTemplate } from '../core/testTemplate'
import { MOCK_TEST_TEMPLATES } from './mockTemplates'

export async function getTestTemplates(): Promise<TestTemplate[]> {
  if (USE_MOCK) return MOCK_TEST_TEMPLATES
  
  const { data, error } = await supabase.from('test_templates').select('*')
  if (error) throw error
  
  return data.map(d => TestTemplateSchema.parse({
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    scalaDefault: d.scala_default,
    campiPrincipali: d.campi_principali,
    gruppiSecondari: d.gruppi_secondari ?? undefined,
    notaRange: d.nota_range ?? undefined,
    richiedeEtaValutazione: d.richiede_eta_valutazione,
    richiedeStrumentiUtilizzati: d.richiede_strumenti_utilizzati,
    builtIn: d.built_in,
    attivo: d.attivo,
    schemaVersion: d.schema_version,
    createdAt: d.created_at ?? undefined,
    updatedAt: d.updated_at ?? undefined
  }))
}

export async function getTestTemplatesAttivi(): Promise<TestTemplate[]> {
  const all = await getTestTemplates()
  return all.filter(t => t.attivo)
}

export async function insertTestTemplate(t: Omit<TestTemplate,'id'|'createdAt'|'updatedAt'|'builtIn'>): Promise<TestTemplate> {
  if (USE_MOCK) throw new Error("Operazione non supportata in modalità demo")
  
  const id = crypto.randomUUID()
  const payload = {
    id,
    nome: t.nome,
    categoria: t.categoria,
    scala_default: t.scalaDefault,
    campi_principali: t.campiPrincipali,
    gruppi_secondari: t.gruppiSecondari,
    nota_range: t.notaRange,
    richiede_eta_valutazione: t.richiedeEtaValutazione,
    richiede_strumenti_utilizzati: t.richiedeStrumentiUtilizzati,
    built_in: false,
    attivo: t.attivo,
    schema_version: t.schemaVersion || 1
  }
  
  const { data, error } = await supabase.from('test_templates').insert(payload).select().single()
  if (error) throw error
  
  return TestTemplateSchema.parse({
    id: data.id,
    nome: data.nome,
    categoria: data.categoria,
    scalaDefault: data.scala_default,
    campiPrincipali: data.campi_principali,
    gruppiSecondari: data.gruppi_secondari,
    notaRange: data.nota_range,
    richiedeEtaValutazione: data.richiede_eta_valutazione,
    richiedeStrumentiUtilizzati: data.richiede_strumenti_utilizzati,
    builtIn: data.built_in,
    attivo: data.attivo,
    schemaVersion: data.schema_version,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  })
}

export async function updateTestTemplate(id: string, patch: Partial<TestTemplate>): Promise<void> {
  if (USE_MOCK) throw new Error("Operazione non supportata in modalità demo")
  
  const payload: any = {}
  if (patch.nome !== undefined) payload.nome = patch.nome
  if (patch.categoria !== undefined) payload.categoria = patch.categoria
  if (patch.scalaDefault !== undefined) payload.scala_default = patch.scalaDefault
  if (patch.campiPrincipali !== undefined) payload.campi_principali = patch.campiPrincipali
  if (patch.gruppiSecondari !== undefined) payload.gruppi_secondari = patch.gruppiSecondari
  if (patch.notaRange !== undefined) payload.nota_range = patch.notaRange
  if (patch.richiedeEtaValutazione !== undefined) payload.richiede_eta_valutazione = patch.richiedeEtaValutazione
  if (patch.richiedeStrumentiUtilizzati !== undefined) payload.richiede_strumenti_utilizzati = patch.richiedeStrumentiUtilizzati
  if (patch.attivo !== undefined) payload.attivo = patch.attivo
  
  const { error } = await supabase.from('test_templates').update(payload).eq('id', id)
  if (error) throw error
}

export async function disattivaTestTemplate(id: string): Promise<void> {
  return updateTestTemplate(id, { attivo: false })
}
