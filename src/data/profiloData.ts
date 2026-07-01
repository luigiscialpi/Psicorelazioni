import { supabase } from '../core/supabase'
import { MOCK_PROFILO_STILE } from './mockData'
import type { ProfiloProfessionista, ProfiloStileRecord } from '../core/types'
import { USE_MOCK } from '../core/config'

const PROFESSIONISTA_LS_KEY = 'psicorelazioni_professionista_v1'

function loadProfessionistaLocal(): ProfiloProfessionista | null {
  try {
    const raw = localStorage.getItem(PROFESSIONISTA_LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveProfessionistaLocal(value: ProfiloProfessionista | null) {
  try {
    localStorage.setItem(PROFESSIONISTA_LS_KEY, JSON.stringify(value || null))
  } catch {
    // no-op
  }
}

let mockProfilo: string | null = MOCK_PROFILO_STILE
let mockProfessionista: ProfiloProfessionista | null = null

export async function getProfiloStile(): Promise<string | null> {
  if (USE_MOCK) return mockProfilo || null
  const { data } = await supabase.from('profilo_stile').select('*').eq('id', 1).single()
  return data?.documento_stile || null
}

export async function getProfiloStileCompleto(): Promise<ProfiloStileRecord> {
  if (USE_MOCK) return {
    documento_stile: mockProfilo || null,
    updated_at: null,
    num_relazioni_analizzate: mockProfilo ? 3 : 0,
  }
  const { data } = await supabase.from('profilo_stile').select('*').eq('id', 1).single()
  return (data || { documento_stile: null, updated_at: null, num_relazioni_analizzate: 0 }) as ProfiloStileRecord
}

export async function saveProfiloStile(testo: string, numRelazioni: number): Promise<void> {
  if (USE_MOCK) { mockProfilo = testo; return }
  await supabase.from('profilo_stile').upsert({
    id: 1,
    documento_stile: testo,
    num_relazioni_analizzate: numRelazioni,
    updated_at: new Date().toISOString(),
    versione: 1,
  })
}

export async function getProfiloProfessionista(): Promise<ProfiloProfessionista | null> {
  if (USE_MOCK) {
    if (mockProfessionista) return mockProfessionista
    mockProfessionista = loadProfessionistaLocal()
    return mockProfessionista
  }

  try {
    const { data, error } = await supabase.from('professionista').select('*').eq('id', 1).single()
    if (!error && data) {
      saveProfessionistaLocal(data)
      return data
    }
  } catch {
    // fallback locale
  }

  return loadProfessionistaLocal()
}

export async function saveProfiloProfessionista(payload: ProfiloProfessionista): Promise<ProfiloProfessionista> {
  const row: ProfiloProfessionista = {
    id: 1,
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
    saveProfessionistaLocal(row)
    return row
  }

  try {
    const { data, error } = await supabase.from('professionista').upsert(row).select().single()
    if (!error && data) {
      saveProfessionistaLocal(data)
      return data
    }

    if (error && String(error.message || '').toLowerCase().includes('genere')) {
      const { genere: _genere, ...legacyRow } = row
      const { data: legacyData, error: legacyError } = await supabase.from('professionista').upsert(legacyRow).select().single()
      if (!legacyError && legacyData) {
        const enriched = { ...legacyData, genere: row.genere }
        saveProfessionistaLocal(enriched)
        return enriched
      }
    }
  } catch {
    // fallback locale
  }

  saveProfessionistaLocal(row)
  return row
}
