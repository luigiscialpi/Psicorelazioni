import { describe, it, expect } from 'vitest'
import { formTemplateReducer, INIT_FORM, righeCheReferenzianoChiave } from './gestioneTestState'
import type { FormTemplateState, FormCampo } from './gestioneTestState'

function stateConCampi(campiPrincipali: FormCampo[]): FormTemplateState {
  return {
    form: { ...INIT_FORM, campiPrincipali },
    soglieCustom: [],
    showPreview: false,
    saving: false,
    error: '',
  }
}

describe('gestioneTestState', () => {
  describe('righeCheReferenzianoChiave', () => {
    it('trova la riga che referenzia la chiave in modalità somma/media', () => {
      const totale: FormCampo = { key: 'totale', label: 'Totale', descr: '', formula: { modo: 'somma', parti: ['icv'], espressioneAvanzata: '', descrizione: '' } }
      const risultato = righeCheReferenzianoChiave('icv', [totale])
      expect(risultato).toHaveLength(1)
      expect(risultato[0].key).toBe('totale')
    })

    it('trova la riga che referenzia la chiave in modalità avanzata', () => {
      const totale: FormCampo = { key: 'totale', label: 'Totale', descr: '', formula: { modo: 'avanzata', parti: [], espressioneAvanzata: '({icv} + {irp}) / 2', descrizione: '' } }
      const risultato = righeCheReferenzianoChiave('icv', [totale])
      expect(risultato).toHaveLength(1)
    })

    it('non trova nulla se la chiave non è usata da nessuna formula', () => {
      const totale: FormCampo = { key: 'totale', label: 'Totale', descr: '', formula: { modo: 'somma', parti: ['irp'], espressioneAvanzata: '', descrizione: '' } }
      expect(righeCheReferenzianoChiave('icv', [totale])).toHaveLength(0)
    })
  })

  describe('UPDATE_CAMPO', () => {
    it('rigenera normalmente la chiave dallo slug quando la riga non è referenziata da nessuna formula', () => {
      const state = stateConCampi([{ key: '', label: '', descr: '' }])
      const next = formTemplateReducer(state, { type: 'UPDATE_CAMPO', payload: { idx: 0, field: 'label', value: 'Comprensione Verbale' } })
      expect(next.form.campiPrincipali[0].key).toBe('comprensione-verbale')
    })

    it('NON rigenera la chiave se è già usata dalla formula di un\'altra riga (bug storico)', () => {
      const icv: FormCampo = { key: 'icv', label: 'Comprensione Verbale', descr: '' }
      const totale: FormCampo = { key: 'totale', label: 'Totale', descr: '', formula: { modo: 'somma', parti: ['icv'], espressioneAvanzata: '', descrizione: '' } }
      const state = stateConCampi([icv, totale])

      // L'utente corregge un refuso nell'etichetta: la chiave "icv" usata dalla formula
      // di "Totale" deve restare invariata, altrimenti il calcolo si romperebbe in silenzio.
      const next = formTemplateReducer(state, { type: 'UPDATE_CAMPO', payload: { idx: 0, field: 'label', value: 'Comprensione Verbale (ICV)' } })
      expect(next.form.campiPrincipali[0].key).toBe('icv')
      expect(next.form.campiPrincipali[0].label).toBe('Comprensione Verbale (ICV)')
    })

    it('permette comunque di cambiare la chiave a mano, anche se referenziata', () => {
      const icv: FormCampo = { key: 'icv', label: 'Comprensione Verbale', descr: '' }
      const totale: FormCampo = { key: 'totale', label: 'Totale', descr: '', formula: { modo: 'somma', parti: ['icv'], espressioneAvanzata: '', descrizione: '' } }
      const state = stateConCampi([icv, totale])

      const next = formTemplateReducer(state, { type: 'UPDATE_CAMPO', payload: { idx: 0, field: 'key', value: 'icv-nuovo' } })
      expect(next.form.campiPrincipali[0].key).toBe('icv-nuovo')
    })
  })

  describe('UPDATE_CAMPO_GRUPPO', () => {
    it('non rigenera la chiave di un sottotest se è usata da una formula di un campo principale', () => {
      const totale: FormCampo = { key: 'totale', label: 'Totale', descr: '', formula: { modo: 'somma', parti: ['vocabolario'], espressioneAvanzata: '', descrizione: '' } }
      const state: FormTemplateState = {
        form: {
          ...INIT_FORM,
          campiPrincipali: [totale],
          gruppiSecondari: [{ key: 'verbale', label: 'Verbale', campi: [{ key: 'vocabolario', label: 'Vocabolario' }] }],
        },
        soglieCustom: [],
        showPreview: false,
        saving: false,
        error: '',
      }

      const next = formTemplateReducer(state, { type: 'UPDATE_CAMPO_GRUPPO', payload: { gi: 0, ci: 0, field: 'label', value: 'Vocabolario (corretto)' } })
      expect(next.form.gruppiSecondari[0].campi[0].key).toBe('vocabolario')
      expect(next.form.gruppiSecondari[0].campi[0].label).toBe('Vocabolario (corretto)')
    })
  })
})
