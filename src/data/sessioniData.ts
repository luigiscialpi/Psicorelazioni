import { supabase } from '../core/supabase'
import { MOCK_SESSIONI } from './mockData'
import type { SessioneWizard, Id } from '../core/types'
import { USE_MOCK, uid } from '../core/config'

let mockSessioni: SessioneWizard[] = [...MOCK_SESSIONI] as SessioneWizard[]

export async function getSessioniInCorso(): Promise<SessioneWizard[]> {
  if (USE_MOCK) return mockSessioni.filter(s => s.stato === 'in_corso')
  const { data } = await supabase
    .from('sessioni_wizard').select('*').eq('stato', 'in_corso').order('created_at', { ascending: false })
  return (data || []) as SessioneWizard[]
}

export async function upsertSessione(id: Id | null, patch: Partial<SessioneWizard>): Promise<SessioneWizard | Pick<SessioneWizard, 'id'>> {
  if (USE_MOCK) {
    const idx = mockSessioni.findIndex(s => s.id === id)
    if (idx >= 0) { mockSessioni[idx] = { ...mockSessioni[idx], ...patch }; return mockSessioni[idx] }
    const s = { id: id || uid(), created_at: new Date().toISOString(), stato: 'in_corso', ...patch }
    mockSessioni.push(s); return s
  }
  if (id) {
    await supabase.from('sessioni_wizard').update(patch).eq('id', id)
    return { id }
  }
  const userId = (await supabase.auth.getUser()).data.user?.id
  const { data } = await supabase.from('sessioni_wizard').insert({ ...patch, owner_id: userId }).select().single()
  return data as SessioneWizard
}

export async function getSessioneById(id: Id | null): Promise<SessioneWizard | null> {
  if (!id) return null
  if (USE_MOCK) return mockSessioni.find(s => s.id === id) || null
  const { data } = await supabase.from('sessioni_wizard').select('*').eq('id', id).single()
  return data as SessioneWizard | null
}

export async function deleteSessione(id: Id | null): Promise<boolean> {
  if (!id) return false
  if (USE_MOCK) {
    const before = mockSessioni.length
    mockSessioni = mockSessioni.filter(s => s.id !== id)
    return mockSessioni.length < before
  }
  const { error } = await supabase.from('sessioni_wizard').delete().eq('id', id)
  return !error
}
