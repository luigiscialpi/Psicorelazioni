import { supabase } from '../core/supabase'
import { MOCK_PROFILO_STILE } from './mockData'
import type { ProfiloProfessionista, ProfiloStileRecord, TemplateRilevatoItem } from '../core/types'
import { USE_MOCK } from '../core/config'

function getProfessionistaLsKey(userId: string) {
  return `psicorelazioni_professionista_v1_${userId}`
}

function loadProfessionistaLocal(userId: string): ProfiloProfessionista | null {
  try {
    const raw = localStorage.getItem(getProfessionistaLsKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveProfessionistaLocal(userId: string, value: ProfiloProfessionista | null) {
  try {
    localStorage.setItem(getProfessionistaLsKey(userId), JSON.stringify(value || null))
  } catch {
    // no-op
  }
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

let mockProfilo: string | null = MOCK_PROFILO_STILE
let mockProfessionista: ProfiloProfessionista | null = null
let mockTemplateRilevati: TemplateRilevatoItem[] = []

export async function getProfiloStile(): Promise<string | null> {
  if (USE_MOCK) return mockProfilo || null
  const userId = await getUserId()
  if (!userId) return null
  const { data } = await supabase.from('profilo_stile').select('documento_stile').eq('owner_id', userId).maybeSingle()
  return data?.documento_stile || null
}

export async function getProfiloStileCompleto(): Promise<ProfiloStileRecord> {
  if (USE_MOCK) return {
    documento_stile: mockProfilo || null,
    updated_at: null,
    num_relazioni_analizzate: mockProfilo ? 3 : 0,
  }
  const userId = await getUserId()
  if (!userId) return { documento_stile: null, updated_at: null, num_relazioni_analizzate: 0 }
  const { data } = await supabase.from('profilo_stile').select('*').eq('owner_id', userId).maybeSingle()
  return (data || { documento_stile: null, updated_at: null, num_relazioni_analizzate: 0 }) as ProfiloStileRecord
}

export async function saveProfiloStile(testo: string, numRelazioni: number): Promise<void> {
  if (USE_MOCK) { mockProfilo = testo; mockTemplateRilevati = []; return }
  const userId = await getUserId()
  if (!userId) return
  await supabase.from('profilo_stile').upsert({
    owner_id: userId,
    documento_stile: testo,
    num_relazioni_analizzate: numRelazioni,
    updated_at: new Date().toISOString(),
    versione: 1,
    template_rilevati: [],
  }, { onConflict: 'owner_id' })
}

export async function getTemplateRilevati(): Promise<TemplateRilevatoItem[]> {
  if (USE_MOCK) return mockTemplateRilevati
  const userId = await getUserId()
  if (!userId) return []
  const { data } = await supabase
    .from('profilo_stile')
    .select('template_rilevati')
    .eq('owner_id', userId)
    .maybeSingle()
  return (data?.template_rilevati as TemplateRilevatoItem[] | null) ?? []
}

export async function saveTemplateRilevati(items: TemplateRilevatoItem[]): Promise<void> {
  if (USE_MOCK) { mockTemplateRilevati = items; return }
  const userId = await getUserId()
  if (!userId) return
  await supabase.from('profilo_stile').upsert({
    owner_id: userId,
    template_rilevati: items,
  }, { onConflict: 'owner_id' })
}

export async function clearTemplateRilevati(): Promise<void> {
  if (USE_MOCK) { mockTemplateRilevati = []; return }
  const userId = await getUserId()
  if (!userId) return
  await supabase.from('profilo_stile').upsert({
    owner_id: userId,
    template_rilevati: [],
  }, { onConflict: 'owner_id' })
}

export async function getProfiloProfessionista(): Promise<ProfiloProfessionista | null> {
  if (USE_MOCK) {
    if (mockProfessionista) return mockProfessionista
    // In mock non c'è userId affidabile, usa la chiave globale per coerenza con il passato
    mockProfessionista = loadProfessionistaLocal('mock')
    return mockProfessionista
  }

  const userId = await getUserId()
  if (!userId) return null

  try {
    const { data, error } = await supabase.from('professionista').select('*').eq('owner_id', userId).maybeSingle()
    if (!error && data) {
      saveProfessionistaLocal(userId, data)
      return data
    }
  } catch {
    // fallback locale
  }

  return loadProfessionistaLocal(userId)
}

export async function saveProfiloProfessionista(payload: ProfiloProfessionista): Promise<ProfiloProfessionista> {
  const userId = await getUserId()
  if (!userId) throw new Error('Utente non autenticato')

  const row: ProfiloProfessionista = {
    nome_completo: payload.nome_completo || null,
    genere: payload.genere || null,
    titolo: payload.titolo || null,
    specializzazione: payload.specializzazione || null,
    email: payload.email || null,
    telefono: payload.telefono || null,
    indirizzo: payload.indirizzo || null,
    citta: payload.citta || null,
    partita_iva: payload.partita_iva || null,
    codice_fiscale: payload.codice_fiscale || null,
    updated_at: new Date().toISOString(),
  }

  if (USE_MOCK) {
    mockProfessionista = row
    saveProfessionistaLocal('mock', row)
    return row
  }

  try {
    const { data, error } = await supabase.from('professionista').upsert({
      ...row,
      owner_id: userId,
    }, { onConflict: 'owner_id' }).select().single()
    if (!error && data) {
      saveProfessionistaLocal(userId, data)
      return data
    }

    if (error && String(error.message || '').toLowerCase().includes('genere')) {
      const { genere: _genere, ...legacyRow } = row
      const { data: legacyData, error: legacyError } = await supabase.from('professionista').upsert({
        ...legacyRow,
        owner_id: userId,
      }, { onConflict: 'owner_id' }).select().single()
      if (!legacyError && legacyData) {
        const enriched = { ...legacyData, genere: row.genere }
        saveProfessionistaLocal(userId, enriched)
        return enriched
      }
    }
  } catch {
    // fallback locale
  }

  saveProfessionistaLocal(userId, row)
  return row
}
