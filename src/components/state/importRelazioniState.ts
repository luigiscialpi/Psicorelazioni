import type { FileKind, ImportedFileEntry, ImportRelazioneMeta } from '../../core/types'

export type ImportedFilesAction =
  | { type: 'ADD'; entry: ImportedFileEntry }
  | { type: 'UPDATE'; id: string; patch: Partial<ImportedFileEntry> }
  | { type: 'REMOVE'; id: string }

export function filesReducer(state: ImportedFileEntry[], action: ImportedFilesAction): ImportedFileEntry[] {
  switch (action.type) {
    case 'ADD':
      return [...state, action.entry]
    case 'UPDATE':
      return state.map(file => file.id === action.id ? { ...file, ...action.patch } : file)
    case 'REMOVE':
      return state.filter(file => file.id !== action.id)
    default:
      return state
  }
}

export function createImportedFileEntry(file: File, kind: FileKind): ImportedFileEntry {
  return {
    id: Math.random().toString(36).slice(2),
    name: file.name,
    kind,
    status: 'converting',
    markdown: '',
    file,
  }
}

export function createDefaultImportMeta(fileName: string): ImportRelazioneMeta {
  return {
    titolo: fileName.replace(/\.(docx?|pdf)$/i, ''),
    anno: new Date().getFullYear(),
    tipo_relazione: '',
    codice_paziente: '',
  }
}
