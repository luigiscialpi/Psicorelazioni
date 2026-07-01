import { supabase } from '../core/supabase'
import { MOCK_PAZIENTI } from './mockData'
import type { Paziente, AnagraficaPaziente, Id } from '../core/types'
import { USE_MOCK, uid } from '../core/config'

let mockPazienti: Paziente[] = [...MOCK_PAZIENTI] as Paziente[]

export async function getPazienti(): Promise<Paziente[]> {
  if (USE_MOCK) return [...mockPazienti]
  const { data } = await supabase.from('pazienti').select('*')
  return (data || []) as Paziente[]
}

export async function getPazienteById(id: Id): Promise<Paziente | null> {
  if (USE_MOCK) return mockPazienti.find(p => p.id === id) || null
  const { data } = await supabase.from('pazienti').select('*').eq('id', id).single()
  return data as Paziente | null
}

export async function upsertPaziente(codice: string): Promise<Pick<Paziente, 'id'> & Partial<Paziente>> {
  if (USE_MOCK) {
    let p = mockPazienti.find(x => x.codice === codice)
    if (!p) { p = { id: uid(), codice, created_at: new Date().toISOString() }; mockPazienti.push(p) }
    return p
  }
  const { data: existing } = await supabase.from('pazienti').select('id').eq('codice', codice).single()
  if (existing) return existing
  const { data } = await supabase.from('pazienti').insert({ codice }).select('id').single()
  return data as Pick<Paziente, 'id'>
}

export async function upsertPazienteAnagrafica(anagrafica: AnagraficaPaziente, pazienteId: Id | null = null): Promise<Paziente | null> {
  const payload = {
    nome:          anagrafica.nome || null,
    cognome:       anagrafica.cognome || null,
    data_nascita:  anagrafica.data_nascita || null,
    scuola_classe: anagrafica.scuola_classe || null,
  }

  if (USE_MOCK) {
    if (pazienteId) {
      mockPazienti = mockPazienti.map(p => p.id === pazienteId ? { ...p, ...payload } : p)
      return mockPazienti.find(p => p.id === pazienteId)
    }
    const p = { id: uid(), created_at: new Date().toISOString(), ...payload }
    mockPazienti.push(p)
    return p
  }

  if (pazienteId) {
    const { data } = await supabase.from('pazienti').update(payload).eq('id', pazienteId).select().single()
    return data as Paziente | null
  }
  const { data } = await supabase.from('pazienti').insert(payload).select().single()
  return data as Paziente | null
}
