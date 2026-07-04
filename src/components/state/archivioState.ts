import type { Paziente, Relazione } from '../../core/types'

export type ArchivioState = {
  relazioni: Relazione[]
  loading: boolean
  query: string
  filtroTipo: string
  aperta: Relazione | null
  pazienteAperta: Paziente | null
  confirmDelete: string | null  // id della relazione da eliminare
}

export type ArchivioAction =
  | { type: 'LOADED'; data: Relazione[] }
  | { type: 'QUERY'; value: string }
  | { type: 'FILTRO_TIPO'; value: string }
  | { type: 'APRI'; relazione: Relazione; paziente: Paziente | null }
  | { type: 'CHIUDI' }
  | { type: 'ASK_DELETE'; id: string }
  | { type: 'CANCEL_DELETE' }
  | { type: 'ELIMINA'; id: string }

export const ARCHIVIO_INIT: ArchivioState = {
  relazioni: [],
  loading: true,
  query: '',
  filtroTipo: '',
  aperta: null,
  pazienteAperta: null,
  confirmDelete: null,
}

export function archivioReducer(state: ArchivioState, action: ArchivioAction): ArchivioState {
  switch (action.type) {
    case 'LOADED':
      return { ...state, relazioni: action.data, loading: false }
    case 'QUERY':
      return { ...state, query: action.value }
    case 'FILTRO_TIPO':
      return { ...state, filtroTipo: action.value }
    case 'APRI':
      return { ...state, aperta: action.relazione, pazienteAperta: action.paziente }
    case 'CHIUDI':
      return { ...state, aperta: null, pazienteAperta: null, confirmDelete: null }
    case 'ASK_DELETE':
      return { ...state, confirmDelete: action.id }
    case 'CANCEL_DELETE':
      return { ...state, confirmDelete: null }
    case 'ELIMINA':
      return {
        ...state,
        relazioni: state.relazioni.filter(r => r.id !== action.id),
        aperta: null,
        pazienteAperta: null,
        confirmDelete: null,
      }
    default:
      return state
  }
}
