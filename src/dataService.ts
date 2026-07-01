// ============================================================
// DATA SERVICE — astrae Supabase vs Mock
// Se le env var Supabase sono valorizzate → usa Supabase reale
// Altrimenti → usa i dati mock in memoria
// ============================================================
import { supabase } from './supabase'
import {
  MOCK_RELAZIONI, MOCK_PAZIENTI, MOCK_PROFILO_STILE, MOCK_SESSIONI
} from './mockData'

const USE_MOCK = !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('YOUR_PROJECT')

// Store mock in-memory (sopravvive alla navigazione, non al refresh)
let mockRelazioni: any[]  = [...MOCK_RELAZIONI]
let mockPazienti: any[]   = [...MOCK_PAZIENTI]
let mockSessioni: any[]   = [...MOCK_SESSIONI]
let mockProfilo: any      = MOCK_PROFILO_STILE
let mockProfessionista: any = null

const PROFESSIONISTA_LS_KEY = 'psicorelazioni_professionista_v1'

function loadProfessionistaLocal() {
  try {
    const raw = localStorage.getItem(PROFESSIONISTA_LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveProfessionistaLocal(value: any) {
  try {
    localStorage.setItem(PROFESSIONISTA_LS_KEY, JSON.stringify(value || null))
  } catch {
    // no-op
  }
}

const uid = () => Math.random().toString(36).slice(2, 10)

// ── RELAZIONI ──────────────────────────────────────────────
export async function getRelazioni() {
  if (USE_MOCK) return [...mockRelazioni].reverse()
  const { data } = await supabase
    .from('relazioni').select('*').order('created_at', { ascending: false })
  return data || []
}

export async function insertRelazione(row: any) {
  if (USE_MOCK) {
    const r = { ...row, id: uid(), created_at: new Date().toISOString() }
    mockRelazioni.push(r)
    return r
  }
  const { data } = await supabase.from('relazioni').insert(row).select().single()
  return data
}

export async function updateRelazione(id: string, patch: any) {
  if (USE_MOCK) {
    mockRelazioni = mockRelazioni.map(r => r.id === id ? { ...r, ...patch } : r)
    return
  }
  await supabase.from('relazioni').update(patch).eq('id', id)
}

export async function getRelazioniSimilari(tipo: string, tag: string[] = []) {
  if (USE_MOCK) {
    return mockRelazioni
      .filter(r => r.tipo_relazione === tipo || (r.tag || []).some(t => tag.includes(t)))
      .slice(0, 3)
  }
  const { data } = await supabase
    .from('relazioni').select('*')
    .eq('tipo_relazione', tipo)
    .limit(3)
  return data || []
}

// Recupera una singola relazione per riaprirla nel wizard/editor.
// Usata dall'Archivio quando si clicca "Apri e modifica".
export async function getRelazioneById(id: string) {
  if (USE_MOCK) return mockRelazioni.find(r => r.id === id) || null
  const { data } = await supabase.from('relazioni').select('*').eq('id', id).single()
  return data || null
}

// ── PAZIENTI ───────────────────────────────────────────────
export async function getPazienti() {
  if (USE_MOCK) return [...mockPazienti]
  const { data } = await supabase.from('pazienti').select('*')
  return data || []
}

export async function getPazienteById(id: string) {
  if (USE_MOCK) return mockPazienti.find(p => p.id === id) || null
  const { data } = await supabase.from('pazienti').select('*').eq('id', id).single()
  return data || null
}

export async function upsertPaziente(codice: string) {
  if (USE_MOCK) {
    let p = mockPazienti.find(x => x.codice === codice)
    if (!p) { p = { id: uid(), codice, created_at: new Date().toISOString() }; mockPazienti.push(p) }
    return p
  }
  const { data: existing } = await supabase.from('pazienti').select('id').eq('codice', codice).single()
  if (existing) return existing
  const { data } = await supabase.from('pazienti').insert({ codice }).select('id').single()
  return data
}

// Salva l'anagrafica REALE del paziente (nome, cognome, data di nascita,
// scuola/classe). Se pazienteId è fornito aggiorna quel record, altrimenti
// ne crea uno nuovo. Usata da RisultatoGenerazione.tsx al momento del
// salvataggio in archivio — mai passata a Gemini, solo persistita qui.
export async function upsertPazienteAnagrafica(anagrafica: any, pazienteId: string | null = null) {
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
    return data
  }
  const { data } = await supabase.from('pazienti').insert(payload).select().single()
  return data
}

// ── PROFILO DI STILE ───────────────────────────────────────
export async function getProfiloStile() {
  if (USE_MOCK) return mockProfilo || null
  const { data } = await supabase.from('profilo_stile').select('*').eq('id', 1).single()
  return data?.documento_stile || null
}

// Restituisce l'oggetto completo — usato da ProfiloStile.tsx per
// sapere quante relazioni sono già state analizzate e quando,
// così da identificare quelle "nuove" per l'analisi incrementale.
export async function getProfiloStileCompleto() {
  if (USE_MOCK) return {
    documento_stile: mockProfilo || null,
    updated_at: null,
    num_relazioni_analizzate: mockProfilo ? MOCK_RELAZIONI.length : 0,
  }
  const { data } = await supabase.from('profilo_stile').select('*').eq('id', 1).single()
  return data || { documento_stile: null, updated_at: null, num_relazioni_analizzate: 0 }
}

export async function saveProfiloStile(testo, numRelazioni) {
  if (USE_MOCK) { mockProfilo = testo; return }
  await supabase.from('profilo_stile').upsert({
    id: 1,
    documento_stile: testo,
    num_relazioni_analizzate: numRelazioni,
    updated_at: new Date().toISOString(),
    versione: 1,
  })
}

// ── PROFILO PROFESSIONISTA ────────────────────────────────
export async function getProfiloProfessionista() {
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

export async function saveProfiloProfessionista(payload) {
  const row = {
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

    // Compatibilita con schema precedente senza colonna "genere".
    if (error && String(error.message || '').toLowerCase().includes('genere')) {
      const legacyRow = { ...row }
      delete legacyRow.genere
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

// ── SESSIONI WIZARD ────────────────────────────────────────
export async function getSessioniInCorso() {
  if (USE_MOCK) return mockSessioni.filter(s => s.stato === 'in_corso')
  const { data } = await supabase
    .from('sessioni_wizard').select('*').eq('stato', 'in_corso').order('created_at', { ascending: false })
  return data || []
}

export async function upsertSessione(id, patch) {
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
  const { data } = await supabase.from('sessioni_wizard').insert(patch).select().single()
  return data
}

export async function getSessioneById(id) {
  if (!id) return null
  if (USE_MOCK) return mockSessioni.find(s => s.id === id) || null
  const { data } = await supabase.from('sessioni_wizard').select('*').eq('id', id).single()
  return data || null
}

export async function deleteSessione(id) {
  if (!id) return false
  if (USE_MOCK) {
    const before = mockSessioni.length
    mockSessioni = mockSessioni.filter(s => s.id !== id)
    return mockSessioni.length < before
  }
  const { error } = await supabase.from('sessioni_wizard').delete().eq('id', id)
  return !error
}

export { USE_MOCK }
