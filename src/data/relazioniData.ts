import { supabase } from '../core/supabase'
import { MOCK_RELAZIONI } from './mockData'
import type { Relazione, RelazioneInput, RelazionePatch, Id } from '../core/types'
import { USE_MOCK, uid } from '../core/config'

let mockRelazioni: Relazione[] = [...MOCK_RELAZIONI] as Relazione[]

export async function getRelazioni(): Promise<Relazione[]> {
  if (USE_MOCK) return [...mockRelazioni].reverse()
  const { data } = await supabase
    .from('relazioni').select('*').order('created_at', { ascending: false })
  return (data || []) as Relazione[]
}

export async function insertRelazione(row: RelazioneInput): Promise<Relazione> {
  if (USE_MOCK) {
    const r = { ...row, id: uid(), created_at: new Date().toISOString() }
    mockRelazioni.push(r)
    return r
  }
  const { data } = await supabase.from('relazioni').insert(row).select().single()
  return data as Relazione
}

export async function updateRelazione(id: Id, patch: RelazionePatch): Promise<void> {
  if (USE_MOCK) {
    mockRelazioni = mockRelazioni.map(r => r.id === id ? { ...r, ...patch } : r)
    return
  }
  await supabase.from('relazioni').update(patch).eq('id', id)
}

export async function getRelazioniSimilari(tipo: string, tag: string[] = []): Promise<Relazione[]> {
  if (USE_MOCK) {
    return mockRelazioni
      .filter(r => r.tipo_relazione === tipo || (r.tag || []).some((t: string) => tag.includes(t)))
      .slice(0, 3)
  }
  const { data } = await supabase
    .from('relazioni').select('*')
    .eq('tipo_relazione', tipo)
    .limit(3)
  return (data || []) as Relazione[]
}

export async function getRelazioneById(id: Id): Promise<Relazione | null> {
  if (USE_MOCK) return mockRelazioni.find(r => r.id === id) || null
  const { data } = await supabase.from('relazioni').select('*').eq('id', id).single()
  return data as Relazione | null
}
