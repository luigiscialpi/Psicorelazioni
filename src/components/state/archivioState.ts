import type { Paziente, Relazione } from '../../core/types'

export type ArchivioState = {
  relazioni: Relazione[]
  loading: boolean
  query: string
  filtroTipo: string
  aperta: Relazione | null
  pazienteAperta: Paziente | null
}

export type ArchivioAction =
  | { type: 'LOADED'; data: Relazione[] }
  | { type: 'QUERY'; value: string }
  | { type: 'FILTRO_TIPO'; value: string }
  | { type: 'APRI'; relazione: Relazione; paziente: Paziente | null }
  | { type: 'CHIUDI' }

export const ARCHIVIO_INIT: ArchivioState = {
  relazioni: [],
  loading: true,
  query: '',
  filtroTipo: '',
  aperta: null,
  pazienteAperta: null,
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
      return { ...state, aperta: null, pazienteAperta: null }
    default:
      return state
  }
}
