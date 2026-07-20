import { supabase } from '../core/supabase'
import { USE_MOCK } from '../core/config'
import { TestTemplateSchema, type TestTemplate } from '../core/testTemplate'
import { MOCK_TEST_TEMPLATES } from './mockTemplates'
import { z } from 'zod'

export async function getTestTemplates(): Promise<TestTemplate[]> {
  if (USE_MOCK) return MOCK_TEST_TEMPLATES
  
  const { data, error } = await supabase.from('test_templates').select('*')
  if (error) throw error

  // 🔎 Log diagnostico: visibile in console ad ogni caricamento (non solo in caso di
  // errore), per confermare a colpo d'occhio quante righe arrivano da Supabase e con
  // quali id/nome — utile per verificare che produzione e locale stiano davvero
  // leggendo lo stesso set di righe quando si confronta un comportamento diverso tra i due.
  console.info(`[getTestTemplates] ${data.length} righe ricevute da Supabase:`,
    data.map(d => ({ id: d.id, nome: d.nome, attivo: d.attivo, builtIn: d.built_in })))

  // ⚠️ Resilienza per-riga: un solo template con un dato non conforme allo schema
  // (es. un vecchio record salvato prima di una migrazione, o un valore imperfetto)
  // NON deve impedire il caricamento di TUTTI gli altri template validi. In precedenza
  // un solo `TestTemplateSchema.parse()` fallito dentro `data.map(...)` faceva fallire
  // l'intero `Promise.all` in GestioneTest.tsx, con spinner di caricamento bloccato a
  // vita e nessun template mostrato — bug osservato realmente in produzione. Il template
  // scartato non è quindi visibile finché non viene corretto/reinserito manualmente.
  const risultati: TestTemplate[] = []
  for (const d of data) {
    try {
      risultati.push(TestTemplateSchema.parse({
        id: d.id,
        nome: d.nome,
        categoria: d.categoria,
        scalaDefault: d.scala_default,
        mostraCategoriaDescrittiva: d.mostra_categoria_descrittiva ?? undefined,
        layoutTabelleSecondarie: d.layout_tabelle_secondarie ?? undefined,
        campiPrincipali: d.campi_principali,
        gruppiSecondari: d.gruppi_secondari ?? undefined,
        notaRange: d.nota_range ?? undefined,
        richiedeEtaValutazione: d.richiede_eta_valutazione,
        richiedeStrumentiUtilizzati: d.richiede_strumenti_utilizzati,
        builtIn: d.built_in,
        attivo: d.attivo,
        schemaVersion: d.schema_version,
        createdAt: d.created_at ?? undefined,
        updatedAt: d.updated_at ?? undefined,
        colonne: d.colonne ?? undefined,
        formule: d.formule ?? undefined
      }))
    } catch (e) {
      // 🔎 Log diagnostico esteso: oltre al messaggio, riporta la lista completa
      // delle issue Zod (campo per campo) E il valore grezzo della riga così com'è
      // arrivato da Supabase — per vedere ESATTAMENTE cosa non torna senza doverlo
      // indovinare da un altro ambiente (v. richiesta esplicita di log di debug).
      console.error(
        `[getTestTemplates] Template "${d?.nome || d?.id}" SCARTATO: dati non conformi allo schema. ` +
        `Verifica/correggi la riga in Supabase (tabella test_templates, id=${d?.id}).`,
        {
          issues: e instanceof z.ZodError ? e.issues : undefined,
          message: e instanceof Error ? e.message : String(e),
          rigaGrezza: d,
        }
      )
    }
  }
  console.info(`[getTestTemplates] ${risultati.length}/${data.length} template validati con successo.`)
  return risultati
}

export async function getTestTemplatesAttivi(): Promise<TestTemplate[]> {
  const all = await getTestTemplates()
  return all.filter(t => t.attivo)
}

export async function insertTestTemplate(t: Omit<TestTemplate,'id'|'createdAt'|'updatedAt'|'builtIn'>): Promise<TestTemplate> {
  if (USE_MOCK) throw new Error("Operazione non supportata in modalità demo")
  
  const id = crypto.randomUUID()
  const userId = (await supabase.auth.getUser()).data.user?.id
  const payload = {
    id,
    nome: t.nome,
    categoria: t.categoria,
    scala_default: t.scalaDefault,
    mostra_categoria_descrittiva: t.mostraCategoriaDescrittiva,
    layout_tabelle_secondarie: t.layoutTabelleSecondarie,
    campi_principali: t.campiPrincipali,
    gruppi_secondari: t.gruppiSecondari,
    nota_range: t.notaRange,
    richiede_eta_valutazione: t.richiedeEtaValutazione,
    richiede_strumenti_utilizzati: t.richiedeStrumentiUtilizzati,
    built_in: false,
    attivo: t.attivo,
    schema_version: t.schemaVersion || 1,
    colonne: t.colonne ?? [{ nome: 'Punteggio' }],
    formule: t.formule,
    owner_id: userId
  }
  
  const { data, error } = await supabase.from('test_templates').insert(payload).select().single()
  if (error) throw error
  
  return TestTemplateSchema.parse({
    id: data.id,
    nome: data.nome,
    categoria: data.categoria,
    scalaDefault: data.scala_default,
    mostraCategoriaDescrittiva: data.mostra_categoria_descrittiva ?? undefined,
    layoutTabelleSecondarie: data.layout_tabelle_secondarie ?? undefined,
    campiPrincipali: data.campi_principali,
    gruppiSecondari: data.gruppi_secondari ?? undefined,
    notaRange: data.nota_range ?? undefined,
    richiedeEtaValutazione: data.richiede_eta_valutazione,
    richiedeStrumentiUtilizzati: data.richiede_strumenti_utilizzati,
    builtIn: data.built_in,
    attivo: data.attivo,
    schemaVersion: data.schema_version,
    createdAt: data.created_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
    colonne: data.colonne ?? undefined,
    formule: data.formule ?? undefined
  })
}

export async function updateTestTemplate(id: string, patch: Partial<TestTemplate>): Promise<void> {
  if (USE_MOCK) throw new Error("Operazione non supportata in modalità demo")
  
  const payload: any = {}
  if (patch.nome !== undefined) payload.nome = patch.nome
  if (patch.categoria !== undefined) payload.categoria = patch.categoria
  if (patch.scalaDefault !== undefined) payload.scala_default = patch.scalaDefault
  if (patch.mostraCategoriaDescrittiva !== undefined) payload.mostra_categoria_descrittiva = patch.mostraCategoriaDescrittiva
  if (patch.layoutTabelleSecondarie !== undefined) payload.layout_tabelle_secondarie = patch.layoutTabelleSecondarie
  if (patch.campiPrincipali !== undefined) payload.campi_principali = patch.campiPrincipali
  if (patch.gruppiSecondari !== undefined) payload.gruppi_secondari = patch.gruppiSecondari
  if (patch.notaRange !== undefined) payload.nota_range = patch.notaRange
  if (patch.richiedeEtaValutazione !== undefined) payload.richiede_eta_valutazione = patch.richiedeEtaValutazione
  if (patch.richiedeStrumentiUtilizzati !== undefined) payload.richiede_strumenti_utilizzati = patch.richiedeStrumentiUtilizzati
  if (patch.attivo !== undefined) payload.attivo = patch.attivo
  if (patch.builtIn !== undefined) payload.built_in = patch.builtIn
  if (patch.colonne !== undefined) payload.colonne = patch.colonne
  if (patch.formule !== undefined) payload.formule = patch.formule
  
  // NB: se la RLS filtra la riga (es. un template built_in, non modificabile via update
  // diretto), Supabase NON restituisce un errore: restituisce semplicemente 0 righe.
  // Senza .select() per verificarlo, il salvataggio fallirebbe in silenzio.
  const { data, error } = await supabase.from('test_templates').update(payload).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Salvataggio non riuscito: il template non risulta modificato. Se è un template predefinito (WISC-IV, NEPSY-II) non può essere modificato direttamente — duplicalo in un template personalizzato e modifica quello.')
  }
}

export async function disattivaTestTemplate(id: string): Promise<void> {
  return updateTestTemplate(id, { attivo: false })
}

export async function deleteTestTemplate(id: string): Promise<void> {
  if (USE_MOCK) {
    // If mock, we can just delete from the local array in-memory, but since it's just a local constant, we can throw or just return
    return
  }
  const { data, error } = await supabase.from('test_templates').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Eliminazione non riuscita: probabilmente è un template predefinito, che non può essere eliminato direttamente.')
  }
}

/**
 * Duplica un template (built-in o custom) in un nuovo template personalizzato di proprietà
 * dell'utente corrente, così può essere modificato liberamente senza toccare l'originale
 * (i template built-in non sono modificabili/eliminabili direttamente, vedi updateTestTemplate).
 */
export async function duplicaTestTemplate(t: TestTemplate): Promise<TestTemplate> {
  return insertTestTemplate({
    nome: `${t.nome} (copia)`,
    categoria: t.categoria,
    scalaDefault: t.scalaDefault,
    mostraCategoriaDescrittiva: t.mostraCategoriaDescrittiva,
    layoutTabelleSecondarie: t.layoutTabelleSecondarie,
    campiPrincipali: t.campiPrincipali,
    gruppiSecondari: t.gruppiSecondari,
    notaRange: t.notaRange,
    richiedeEtaValutazione: t.richiedeEtaValutazione,
    richiedeStrumentiUtilizzati: t.richiedeStrumentiUtilizzati,
    attivo: true,
    schemaVersion: t.schemaVersion,
    colonne: t.colonne,
    formule: t.formule,
  })
}

