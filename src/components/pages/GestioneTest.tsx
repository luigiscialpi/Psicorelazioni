import { useState, useEffect, useReducer, type Dispatch } from 'react'
import {
  formTemplateReducer,
  gestioneTestReducer,
  GESTIONE_TEST_INIT,
  INIT_FORM,
  righeCheReferenzianoChiave,
  PRESET_TEMPLATES,
} from '../state/gestioneTestState'
import type { FormState, FormCampo, FormColonna, FormTemplateAction } from '../state/gestioneTestState'
import { Plus, Trash2, ChevronDown, ChevronUp, Eye, Save, AlertTriangle, Lock, Unlock, FlaskConical, X, Check, Sparkles, Pencil, Copy, MoreVertical, Info } from 'lucide-react'
import {
  getTestTemplates, insertTestTemplate, updateTestTemplate, disattivaTestTemplate, deleteTestTemplate, duplicaTestTemplate
} from '../../data/testTemplatesData'
import { validaSoglieCustom, buildFormulaSemplice, parseFormulaSemplice } from '../../services/testTemplateEngine'
import { rilevaNomiTestDaProfilo, generaTemplateTest } from '../../services/geminiService'
import { getProfiloProfessionista, getProfiloStile, getTemplateRilevati, saveTemplateRilevati, clearTemplateRilevati } from '../../data/profiloData'
import type { TestTemplate, CampoTest, GruppoTest, SogliaCustom, ScalaPunteggio, ColonnaTest, FormulaCalcolo } from '../../core/testTemplate'
import { USE_MOCK } from '../../core/config'

// ── Sanitizzazione input ──────────────────────────────────────
// Rimuove intestazioni markdown e formattazione che potrebbe
// interferire con la narrativa generata. §7.1 del piano.
function sanitizzaStringa(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, '') // rimuove # ## ### ecc.
    .replace(/\|[^\n]+\|/g, '')   // rimuove righe tabella markdown
    .replace(/[-]{3,}/g, '')       // rimuove separatori markdown
    .trim()
}

// ── Conversione template → FormState ─────────────────────────
function templateToForm(t: TestTemplate): FormState {
  return {
    nome: t.nome,
    categoria: t.categoria,
    scalaDefault: t.scalaDefault,
    mostraCategoriaDescrittiva: t.mostraCategoriaDescrittiva !== false,
    layoutTabelleSecondarie: t.layoutTabelleSecondarie === 'raggruppato' ? 'raggruppato' : 'interleaved',
    campiPrincipali: (t.campiPrincipali || []).map((c) => {
      const formulaTemplate = t.formule?.find(f => f.targetKey === c.key)
      let formula: FormCampo['formula']
      if (formulaTemplate) {
        const semplice = parseFormulaSemplice(formulaTemplate.espressione)
        formula = semplice
          ? { modo: semplice.operazione, parti: semplice.parti, espressioneAvanzata: '', descrizione: formulaTemplate.descrizione || '' }
          : { modo: 'avanzata', parti: [], espressioneAvanzata: formulaTemplate.espressione, descrizione: formulaTemplate.descrizione || '' }
      }
      return {
        key: c.key,
        label: c.label,
        descr: c.descr || '',
        evidenziato: c.evidenziato,
        formula,
      }
    }),
    gruppiSecondari: (t.gruppiSecondari || []).map((g) => ({
      key: g.key,
      label: g.label,
      campi: (g.campi || []).map((c) => ({
        key: c.key,
        label: c.label,
      })),
    })),
    colonne: (t.colonne && t.colonne.length > 0 ? t.colonne : [{ nome: 'Punteggio' }]).map(c => ({ ...c })),
    notaRange: t.notaRange || '',
    richiedeEtaValutazione: t.richiedeEtaValutazione,
    richiedeStrumentiUtilizzati: t.richiedeStrumentiUtilizzati,
  }
}

// ── Anteprima calcolo fascia fittizio ─────────────────────────
function anteprimaFascia(scala: ScalaPunteggio, valore: number): string {
  if (scala.tipo === 'qi_wisc') {
    if (valore < 70) return 'Estremamente basso'
    if (valore < 80) return 'Limite'
    if (valore < 90) return 'Nella media bassa'
    if (valore < 110) return 'Nella media'
    if (valore < 120) return 'Nella media alta'
    if (valore < 130) return 'Superiore alla media'
    return 'Molto superiore alla media'
  }
  if (scala.tipo === 'scalare') {
    if (valore < 4) return 'Deficitario'
    if (valore < 8) return 'Inferiore alla media'
    if (valore < 12) return 'Nella media'
    if (valore < 15) return 'Superiore alla media'
    return 'Molto superiore'
  }
  if (scala.tipo === 'soglie_custom') {
    for (const s of scala.soglie) {
      if (valore >= s.min && (s.max === null || valore <= s.max)) return s.etichetta
    }
    return 'Fuori range'
  }
  return '—'
}

// ── Componente Soglie Custom ──────────────────────────────────
function EditorSoglieCustom({ soglie, onChange }: {
  soglie: SogliaCustom[]
  onChange: (s: SogliaCustom[]) => void
}) {
  function addSoglia() {
    const last = soglie[soglie.length - 1]
    const newMin = last ? (last.max !== null ? last.max : last.min + 10) : 0
    onChange([...soglie, { min: newMin, max: null, etichetta: '' }])
  }
  function removeSoglia(i: number) {
    onChange(soglie.filter((_, idx) => idx !== i))
  }
  function update(i: number, field: keyof SogliaCustom, v: any) {
    const next = soglie.map((s, idx) => idx === i ? { ...s, [field]: v } : s)
    onChange(next)
  }

  const validazione = validaSoglieCustom(soglie)

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {soglie.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 80px 1fr 32px', gap: 6, alignItems: 'center' }}>
            <input
              className="form-input" type="number" placeholder="Min"
              value={s.min}
              onChange={e => update(i, 'min', Number(e.target.value))}
              style={{ padding: '5px 8px', fontSize: 12.5 }}
            />
            <input
              className="form-input" type="number" placeholder="Max (vuoto=∞)"
              value={s.max ?? ''}
              onChange={e => update(i, 'max', e.target.value === '' ? null : Number(e.target.value))}
              style={{ padding: '5px 8px', fontSize: 12.5 }}
            />
            <input
              className="form-input" placeholder="Etichetta (es. Deficitario)"
              value={s.etichetta}
              onChange={e => update(i, 'etichetta', e.target.value)}
              style={{ padding: '5px 8px', fontSize: 12.5 }}
            />
            <button type="button" onClick={() => removeSoglia(i)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4,
            }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addSoglia} style={{
        fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px dashed var(--accent)',
        borderRadius: 'var(--radius)', padding: '4px 10px', cursor: 'pointer',
      }}>
        + Aggiungi fascia
      </button>
      {!validazione.valida && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <AlertTriangle size={12} /> {validazione.errore}
        </div>
      )}
    </div>
  )
}

// ── Componente Anteprima ──────────────────────────────────────
function Anteprima({ form }: { form: FormState }) {
  const val = form.scalaDefault.tipo === 'qi_wisc' ? 100 : form.scalaDefault.tipo === 'scalare' ? 10 : 5
  const fascia = anteprimaFascia(form.scalaDefault, val)
  const campo = form.campiPrincipali[0]
  const colonne = form.colonne.length > 0 ? form.colonne : [{ nome: 'Punteggio' }]
  const mostraCategoria = form.mostraCategoriaDescrittiva !== false
  const thStyle = { padding: '5px 8px', border: '1px solid var(--border)' }
  const tdStyle = { padding: '5px 8px', border: '1px solid var(--border)', textAlign: 'center' as const }

  return (
    <div style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Anteprima (valori fittizi)
      </div>
      {/* Tabella */}
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Tabella</div>
      <div style={{ overflowX: 'auto', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--accent-lt)' }}>
              <th style={{ textAlign: 'left', ...thStyle }}>{form.nome || 'Test'} scale</th>
              {colonne.flatMap((col, ci) => [
                <th key={`h-${ci}`} style={thStyle}>{col.nome || `Colonna ${ci + 1}`}</th>,
                ...(col.scala && col.mostraFasciaInTabella ? [<th key={`hf-${ci}`} style={thStyle}>{`Fascia ${col.nome || ci + 1}`}</th>] : []),
              ])}
              {mostraCategoria && <th style={thStyle}>Categoria descrittiva</th>}
            </tr>
          </thead>
          <tbody>
            {form.campiPrincipali.slice(0, 3).filter(c => c.label).map((c, i) => (
              <tr key={i}>
                <td style={{ padding: '5px 8px', border: '1px solid var(--border)' }}>{c.label}</td>
                {colonne.flatMap((col, ci) => {
                  const v = val + i * 3 + ci
                  return [
                    <td key={`v-${ci}`} style={tdStyle}>{v}</td>,
                    ...(col.scala && col.mostraFasciaInTabella ? [<td key={`vf-${ci}`} style={tdStyle}>{anteprimaFascia(col.scala, v)}</td>] : []),
                  ]
                })}
                {mostraCategoria && <td style={tdStyle}>{anteprimaFascia(form.scalaDefault, val + i * 3)}</td>}
              </tr>
            ))}
            {!form.campiPrincipali.some(c => c.label) && (
              <tr><td colSpan={colonne.length + (mostraCategoria ? 2 : 1)} style={{ padding: '5px 8px', border: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'center' }}>Aggiungi campi per vedere l'anteprima</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Narrativa */}
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Narrativa (esempio)</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
        {campo?.label
          ? (campo.descr
              ? campo.descr.replace(/\b(WISC|NEPSY)\b/gi, form.nome || 'test')
              : `Il punteggio ottenuto al test ${campo.label} è ${val}, fascia ${fascia.toLowerCase()}.`)
          : 'Aggiungi un campo con descrizione per vedere la narrativa generata.'}
      </p>
      {form.gruppiSecondari.some(g => g.label) && (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 600, margin: '12px 0 6px' }}>Gruppi secondari (solo testo narrativo, mai in tabella)</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            {form.gruppiSecondari.filter(g => g.label).map(g =>
              `Per l'indice ${g.label} sono stati considerati i seguenti subtest: ${g.campi.filter(c => c.label).map(c => c.label).join(', ') || '(nessun subtest ancora)'}.`
            ).join(' ')}
          </p>
        </>
      )}
    </div>
  )
}

// ── Griglia unificata: righe (campi principali) × colonne, cliccabili per configurarle ──
function GrigliaTemplate({ form, dispatch, tipiScala }: {
  form: FormState
  dispatch: Dispatch<FormTemplateAction>
  tipiScala: { tipo: ScalaPunteggio['tipo']; label: string; desc: string }[]
}) {
  const [colonnaAperta, setColonnaAperta] = useState<number | null>(null)
  const [campoAperto, setCampoAperto] = useState<number | null>(null)
  const colW = 108
  const labelW = 168

  function apriColonna(i: number) { setColonnaAperta(colonnaAperta === i ? null : i); setCampoAperto(null) }
  function apriCampo(i: number) { setCampoAperto(campoAperto === i ? null : i); setColonnaAperta(null) }

  return (
    <div>
      <div className="griglia-template-desktop" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${labelW}px repeat(${form.colonne.length}, ${colW}px) 36px`, minWidth: 'fit-content' }}>
          <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} />
          {form.colonne.map((col, ci) => (
            <button key={ci} type="button" onClick={() => apriColonna(ci)} title={col.nome || `Colonna ${ci + 1}`} style={{
              background: colonnaAperta === ci ? 'var(--accent-lt)' : (col.evidenziato ? 'var(--bg-page)' : 'var(--bg-panel)'),
              border: 'none', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
              padding: '8px 6px', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0,
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: col.nome ? undefined : 'var(--danger)', fontStyle: col.nome ? undefined : 'italic' }}>{col.nome || 'manca il nome'}</span>
              {col.scala && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-lt)', borderRadius: 8, padding: '1px 5px', flexShrink: 0 }}>range</span>}
              <Pencil size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>
          ))}
          <button type="button" onClick={() => { dispatch({ type: 'ADD_COLONNA' }); apriColonna(form.colonne.length) }} title="Aggiungi colonna" aria-label="Aggiungi colonna" style={{ background: 'var(--bg-panel)', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={14} />
          </button>

          {form.campiPrincipali.map((campo, ri) => (
            <FragmentRiga key={ri}>
              <button type="button" onClick={() => apriCampo(ri)} title={campo.label || `Riga ${ri + 1}`} style={{
                background: campoAperto === ri ? 'var(--accent-lt)' : (campo.evidenziato ? 'var(--bg-page)' : 'var(--bg-panel)'),
                border: 'none', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                padding: '8px 10px', fontSize: 12, textAlign: 'left', cursor: 'pointer', minWidth: 0, minHeight: 44,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: campo.label ? undefined : 'var(--danger)', fontStyle: campo.label ? undefined : 'italic' }}>{campo.label || 'manca l’etichetta'}</span>
                {campo.formula && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-lt)', borderRadius: 8, padding: '1px 5px', flexShrink: 0 }}>calcolato</span>}
                <Pencil size={10} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 'auto' }} />
              </button>
              {form.colonne.map((_, ci) => (
                <div key={ci} style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>—</div>
              ))}
              <div style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border)' }} />
            </FragmentRiga>
          ))}
          <button type="button" onClick={() => { dispatch({ type: 'ADD_CAMPO' }); apriCampo(form.campiPrincipali.length) }} title="Aggiungi riga" aria-label="Aggiungi riga" style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={14} />
          </button>
          {form.colonne.map((_, ci) => <div key={ci} style={{ background: 'var(--bg-panel)' }} />)}
          <div style={{ background: 'var(--bg-panel)' }} />
        </div>
      </div>

      {/* Vista mobile: sotto i 700px sostituisce la griglia con scroll orizzontale con un
          elenco verticale (stessa interazione: tocca per configurare riga/colonna). */}
      <div className="griglia-template-mobile" style={{ flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Colonne (punteggi)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {form.colonne.map((col, ci) => (
              <button key={ci} type="button" onClick={() => apriColonna(ci)} style={{
                minHeight: 44, background: colonnaAperta === ci ? 'var(--accent-lt)' : 'var(--bg-panel)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px',
                fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', width: '100%',
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: col.nome ? undefined : 'var(--danger)', fontStyle: col.nome ? undefined : 'italic' }}>{col.nome || 'manca il nome'}</span>
                {col.scala && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-lt)', borderRadius: 8, padding: '1px 5px', flexShrink: 0 }}>range</span>}
                <Pencil size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
            <button type="button" onClick={() => { dispatch({ type: 'ADD_COLONNA' }); apriColonna(form.colonne.length) }} aria-label="Aggiungi colonna" style={{ minHeight: 44, background: 'none', border: '1px dashed var(--accent)', borderRadius: 'var(--radius)', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
              <Plus size={14} /> Aggiungi colonna
            </button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Righe</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {form.campiPrincipali.map((campo, ri) => (
              <button key={ri} type="button" onClick={() => apriCampo(ri)} style={{
                minHeight: 44, background: campoAperto === ri ? 'var(--accent-lt)' : 'var(--bg-panel)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px',
                fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', width: '100%',
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: campo.label ? undefined : 'var(--danger)', fontStyle: campo.label ? undefined : 'italic' }}>{campo.label || 'manca l’etichetta'}</span>
                {campo.formula && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-lt)', borderRadius: 8, padding: '1px 5px', flexShrink: 0 }}>calcolato</span>}
                <Pencil size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
            <button type="button" onClick={() => { dispatch({ type: 'ADD_CAMPO' }); apriCampo(form.campiPrincipali.length) }} aria-label="Aggiungi riga" style={{ minHeight: 44, background: 'none', border: '1px dashed var(--accent)', borderRadius: 'var(--radius)', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
              <Plus size={14} /> Aggiungi riga
            </button>
          </div>
        </div>
      </div>

      {colonnaAperta !== null && form.colonne[colonnaAperta] && (
        <PannelloColonna
          colonna={form.colonne[colonnaAperta]} idx={colonnaAperta} dispatch={dispatch} tipiScala={tipiScala}
          onClose={() => setColonnaAperta(null)}
          onRemove={form.colonne.length > 1 ? () => { dispatch({ type: 'REMOVE_COLONNA', payload: colonnaAperta }); setColonnaAperta(null) } : undefined}
        />
      )}
      {campoAperto !== null && form.campiPrincipali[campoAperto] && (
        <PannelloCampo
          campo={form.campiPrincipali[campoAperto]} idx={campoAperto}
          altriCampi={form.campiPrincipali.filter((_, i) => i !== campoAperto)}
          dispatch={dispatch}
          tipiScala={tipiScala}
          onClose={() => setCampoAperto(null)}
          onRemove={form.campiPrincipali.length > 1 ? () => { dispatch({ type: 'REMOVE_CAMPO', payload: campoAperto }); setCampoAperto(null) } : undefined}
        />
      )}
    </div>
  )
}

// Le celle della griglia sono generate da due .map() distinti (riga-etichetta + colonne dati)
// che devono restare fratelli diretti nella stessa CSS grid: un div wrapper romperebbe il
// layout a colonne. FragmentRiga isola comunque la key per riga senza introdurre wrapper.
function FragmentRiga({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function PannelloColonna({ colonna, idx, dispatch, tipiScala, onClose, onRemove }: {
  colonna: FormColonna
  idx: number
  dispatch: Dispatch<FormTemplateAction>
  tipiScala: { tipo: ScalaPunteggio['tipo']; label: string; desc: string }[]
  onClose: () => void
  onRemove?: () => void
}) {
  return (
    <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', background: 'var(--bg-panel)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Colonna</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {onRemove && <button type="button" onClick={onRemove} title="Elimina colonna" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>}
          <button type="button" onClick={onClose} title="Chiudi" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={14} /></button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nome colonna *</label>
          <input className="form-input" placeholder="es. Punti T, Percentile..." value={colonna.nome}
            onChange={e => dispatch({ type: 'UPDATE_COLONNA_NOME', payload: { idx, value: e.target.value } })} style={{ marginTop: 3 }} autoFocus />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!colonna.evidenziato} onChange={e => dispatch({ type: 'SET_COLONNA_EVIDENZIATO', payload: { idx, value: e.target.checked } })} />
          Evidenzia questa colonna nel documento (colore neutro)
        </label>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Range di questa colonna</label>
          <select className="form-input" value={colonna.scala?.tipo || ''}
            onChange={e => dispatch({ type: 'SET_COLONNA_SCALA_TIPO', payload: { idx, tipo: e.target.value ? e.target.value as ScalaPunteggio['tipo'] : null } })}
            style={{ marginTop: 3, cursor: 'pointer' }}>
            <option value="">Nessuno (solo dato informativo)</option>
            {tipiScala.map(t => <option key={t.tipo} value={t.tipo}>{t.label}</option>)}
          </select>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Il range calcola comunque la fascia (visibile dal vivo nel wizard, sempre inviata a Gemini): la colonna qui sotto decide solo se comparire anche come colonna a sé nella tabella del documento finale.</p>
        </div>
        {colonna.scala && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!colonna.mostraFasciaInTabella} onChange={e => dispatch({ type: 'SET_COLONNA_MOSTRA_FASCIA', payload: { idx, value: e.target.checked } })} />
            Mostra "Fascia {colonna.nome || 'colonna'}" come colonna nella tabella del documento
          </label>
        )}
        {colonna.scala?.tipo === 'soglie_custom' && (
          <div style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-page)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Fasce di "{colonna.nome || 'questa colonna'}"</div>
            <EditorSoglieCustom soglie={colonna.scala.soglie} onChange={soglie => dispatch({ type: 'SET_COLONNA_SOGLIE', payload: { idx, soglie } })} />
          </div>
        )}
      </div>
    </div>
  )
}

// Traduce un'espressione avanzata ({icv} + {irp}) / 2 nelle etichette corrispondenti,
// per una preview leggibile senza dover interpretare le chiavi (v. piano UX Fase 6).
// Pura trasformazione di visualizzazione: la stringa salvata non viene mai toccata.
function formulaLeggibile(espressione: string, campi: FormCampo[]): string {
  const risolta = espressione.replace(/\{([a-zA-Z0-9_-]+)\}/g, (_match, chiave) => {
    const trovato = campi.find(c => c.key === chiave)
    return trovato?.label || `{${chiave}}`
  })
  return `= ${risolta.replace(/\//g, ' ÷ ').replace(/\*/g, ' × ')}`
}

function PannelloCampo({ campo, idx, altriCampi, dispatch, tipiScala, onClose, onRemove }: {
  campo: FormCampo
  idx: number
  altriCampi: FormCampo[]
  dispatch: Dispatch<FormTemplateAction>
  tipiScala: { tipo: ScalaPunteggio['tipo']; label: string; desc: string }[]
  onClose: () => void
  onRemove?: () => void
}) {  const formula = campo.formula
  const referenziataDa = righeCheReferenzianoChiave(campo.key, altriCampi)
  return (
    <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', background: 'var(--bg-panel)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Riga</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {onRemove && <button type="button" onClick={onRemove} title="Elimina riga" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>}
          <button type="button" onClick={onClose} title="Chiudi" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={14} /></button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Etichetta *</label>
          <input className="form-input" placeholder="es. Comprensione Verbale (ICV)" value={campo.label}
            onChange={e => dispatch({ type: 'UPDATE_CAMPO', payload: { idx, field: 'label', value: e.target.value } })} style={{ marginTop: 3 }} autoFocus />
        </div>
        {/* L'identificativo interno è un dettaglio tecnico (serve solo alle formule): resta
            nascosto di default, non un campo da compilare come l'etichetta. */}
        <details style={{ fontSize: 11.5 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, listStyle: 'none' }}>
            <Info size={12} /> Impostazioni avanzate (identificativo interno)
          </summary>
          <div style={{ marginTop: 8, paddingLeft: 2 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Identificativo interno (automatico)</label>
            <input className="form-input" value={campo.key}
              onChange={e => dispatch({ type: 'UPDATE_CAMPO', payload: { idx, field: 'key', value: e.target.value } })} style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 12 }} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
              Generato automaticamente dall'etichetta e usato solo internamente (es. dalle formule di calcolo). Modificalo a mano solo se sai perché ti serve.
            </p>
            {referenziataDa.length > 0 && (
              <p style={{ fontSize: 11, color: 'var(--accent-dk)', margin: '6px 0 0', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                Questa riga è usata nel calcolo di «{referenziataDa.map(r => r.label || '(senza etichetta)').join(', ')}»: puoi correggere l'etichetta liberamente, l'identificativo resta invariato. Se lo cambi tu a mano, quel calcolo smette di funzionare finché non lo aggiorni anche lì.
              </p>
            )}
          </div>
        </details>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Frase descrittiva narrativa (facoltativa)</label>
          <input className="form-input" placeholder="es. La prestazione nell'ambito della comprensione verbale è risultata..." value={campo.descr}
            onChange={e => dispatch({ type: 'UPDATE_CAMPO', payload: { idx, field: 'descr', value: e.target.value } })} style={{ marginTop: 3 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!campo.evidenziato} onChange={e => dispatch({ type: 'SET_CAMPO_EVIDENZIATO', payload: { idx, value: e.target.checked } })} />
          Evidenzia questa riga nel documento (colore neutro)
        </label>

        <details style={{ fontSize: 11.5 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, listStyle: 'none' }}>
            <Info size={12} /> Range personalizzato per questa riga (opzionale)
          </summary>
          <div style={{ marginTop: 8, paddingLeft: 2 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px', lineHeight: 1.5 }}>
              Solo se questa riga usa un range diverso dalla Scala di default del test (es. un subtest con un cut-off proprio). Se non impostato, questa riga eredita la Scala di default.
            </p>
            <select className="form-input" value={campo.scala?.tipo || ''}
              onChange={e => dispatch({ type: 'SET_CAMPO_SCALA_TIPO', payload: { idx, tipo: e.target.value ? e.target.value as ScalaPunteggio['tipo'] : null } })}
              style={{ cursor: 'pointer' }}>
              <option value="">Eredita la Scala di default del test</option>
              {tipiScala.map(t => <option key={t.tipo} value={t.tipo}>{t.label}</option>)}
            </select>
            {campo.scala?.tipo === 'soglie_custom' && (
              <div style={{ marginTop: 8, padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-page)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Fasce di questa riga</div>
                <EditorSoglieCustom soglie={campo.scala.soglie} onChange={soglie => dispatch({ type: 'SET_CAMPO_SOGLIE', payload: { idx, soglie } })} />
              </div>
            )}
          </div>
        </details>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!formula} onChange={e => dispatch({ type: 'SET_CAMPO_FORMULA_MODO', payload: { idx, modo: e.target.checked ? 'somma' : null } })} />

          Riga calcolata (es. un Totale)
        </label>

        {formula && (
          <div style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-page)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {(['somma', 'media', 'avanzata'] as const).map(modo => (
                <button key={modo} type="button" onClick={() => dispatch({ type: 'SET_CAMPO_FORMULA_MODO', payload: { idx, modo } })} style={{
                  fontSize: 11.5, padding: '4px 10px', borderRadius: 'var(--radius)', cursor: 'pointer',
                  border: `1px solid ${formula.modo === modo ? 'var(--accent)' : 'var(--border-md)'}`,
                  background: formula.modo === modo ? 'var(--accent-lt)' : 'transparent',
                }}>
                  {modo === 'somma' ? 'Somma' : modo === 'media' ? 'Media' : 'Avanzata'}
                </button>
              ))}
            </div>

            {formula.modo !== 'avanzata' ? (
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                  {formula.modo === 'somma' ? 'Somma di:' : 'Media di:'}
                </p>
                {altriCampi.length === 0 ? (
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Aggiungi altre righe per poterle selezionare qui.</p>
                ) : altriCampi.map(altro => (
                  <label key={altro.key || altro.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={formula.parti.includes(altro.key)}
                      onChange={() => dispatch({ type: 'TOGGLE_CAMPO_FORMULA_PARTE', payload: { idx, chiave: altro.key } })} />
                    {altro.label || altro.key || '(senza etichetta)'}
                  </label>
                ))}
              </div>
            ) : (
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Espressione (usa {'{chiave}'} per riferirti alle altre righe)</label>
                <input className="form-input" placeholder="es. ({icv} + {irp}) / 2" value={formula.espressioneAvanzata}
                  onChange={e => dispatch({ type: 'SET_CAMPO_FORMULA_ESPRESSIONE', payload: { idx, value: e.target.value } })}
                  style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 12.5 }} />
                {/* Traduzione di sola lettura: {chiave} → etichetta corrispondente, per capire
                    a colpo d'occhio cosa calcola l'espressione senza decifrare le chiavi. */}
                {formula.espressioneAvanzata.trim() && (
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', margin: '6px 0 0' }}>
                    {formulaLeggibile(formula.espressioneAvanzata, altriCampi)}
                  </p>
                )}
                {altriCampi.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {altriCampi.filter(a => a.key).map(altro => (
                      <button key={altro.key} type="button"
                        onClick={() => dispatch({ type: 'SET_CAMPO_FORMULA_ESPRESSIONE', payload: { idx, value: `${formula.espressioneAvanzata}{${altro.key}}` } })}
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius)', border: '1px solid var(--border-md)', background: 'var(--bg-panel)', cursor: 'pointer', fontFamily: 'monospace' }}>
                        {'{' + altro.key + '}'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Form di creazione/modifica ────────────────────────────────
function FormTemplate({
  initial, onSave, onCancel,
}: {
  initial?: FormState
  onSave: (f: FormState) => Promise<void>
  onCancel: () => void
}) {
  const [state, dispatch] = useReducer(formTemplateReducer, {
    form: initial || INIT_FORM,
    soglieCustom: initial?.scalaDefault.tipo === 'soglie_custom' ? initial.scalaDefault.soglie : [],
    // Anteprima aperta di default solo in creazione: è lo strumento principale per capire
    // "cosa sto costruendo" senza dover interpretare griglia/scala a mente. In modifica di un
    // template esistente resta chiusa per non aggiungere ingombro a chi già lo conosce.
    showPreview: !initial,
    saving: false,
    error: '',
  })

  const { form, soglieCustom, showPreview, saving, error } = state

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    dispatch({ type: 'SET_FIELD', payload: { key: k, value: v } })
  }

  const [gruppiAperti, setGruppiAperti] = useState<Record<number, boolean>>({})
  // Sezioni facoltative collassate di default: si aprono da sole solo se il template che si
  // sta modificando le usa già, così in modifica non si nasconde dato già presente.
  const [sezioneGruppiAperta, setSezioneGruppiAperta] = useState(!!initial && initial.gruppiSecondari.length > 0)
  const [sezioneOpzioniAperta, setSezioneOpzioniAperta] = useState(!!initial && (!!initial.notaRange.trim() || initial.richiedeEtaValutazione || initial.richiedeStrumentiUtilizzati))

  function addGruppo() {
    setGruppiAperti(prev => ({ ...prev, [form.gruppiSecondari.length]: true }))
    dispatch({ type: 'ADD_GRUPPO' })
  }
  function removeGruppo(i: number) {
    dispatch({ type: 'REMOVE_GRUPPO', payload: i })
  }
  function updateGruppo(i: number, field: string, v: string) {
    dispatch({ type: 'UPDATE_GRUPPO', payload: { idx: i, field, value: v } })
  }
  function addCampoGruppo(gi: number) {
    dispatch({ type: 'ADD_CAMPO_GRUPPO', payload: gi })
  }
  function removeCampoGruppo(gi: number, ci: number) {
    dispatch({ type: 'REMOVE_CAMPO_GRUPPO', payload: { gi, ci } })
  }
  function updateCampoGruppo(gi: number, ci: number, field: string, v: string) {
    dispatch({ type: 'UPDATE_CAMPO_GRUPPO', payload: { gi, ci, field, value: v } })
  }

  function getScalaEffettiva(): ScalaPunteggio {
    if (form.scalaDefault.tipo === 'soglie_custom') {
      return { tipo: 'soglie_custom', soglie: soglieCustom }
    }
    return form.scalaDefault
  }

  function validate(): string {
    if (!form.nome.trim()) return 'Il nome del test è obbligatorio.'
    if (form.campiPrincipali.some(c => !c.label.trim())) return 'Tutti i campi principali devono avere un\'etichetta.'
    if (form.campiPrincipali.some(c => !c.key.trim())) return 'Tutti i campi principali devono avere una chiave (generata automaticamente dall\'etichetta).'
    if (new Set(form.campiPrincipali.map(c => c.key)).size !== form.campiPrincipali.length) return 'Le chiavi dei campi principali devono essere univoche.'
    if (form.scalaDefault.tipo === 'soglie_custom') {
      const v = validaSoglieCustom(soglieCustom)
      if (!v.valida) return `Soglie custom non valide: ${v.errore}`
    }
    if (form.colonne.length === 0) return 'Serve almeno una colonna punteggio.'
    if (form.colonne.some(c => !c.nome.trim())) return 'Tutte le colonne devono avere un nome.'
    if (new Set(form.colonne.map(c => c.nome.trim().toLowerCase())).size !== form.colonne.length) return 'I nomi delle colonne devono essere univoci.'
    for (const c of form.colonne) {
      if (c.scala?.tipo === 'soglie_custom') {
        const v = validaSoglieCustom(c.scala.soglie)
        if (!v.valida) return `Soglie della colonna "${c.nome}" non valide: ${v.errore}`
      }
    }
    const chiaviTutte = new Set(form.campiPrincipali.map(c => c.key))
    for (const c of form.campiPrincipali) {
      if (!c.formula) continue
      const etichetta = c.label || c.key || 'senza nome'
      if (c.formula.modo === 'avanzata') {
        const tokens = c.formula.espressioneAvanzata.match(/\{([a-zA-Z0-9_-]+)\}/g) || []
        if (tokens.length === 0) return `La riga calcolata "${etichetta}" ha un'espressione vuota o senza riferimenti a {chiave}.`
        for (const t of tokens) {
          const chiave = t.slice(1, -1)
          if (chiave === c.key) return `La riga calcolata "${etichetta}" non può riferirsi a se stessa.`
          if (!chiaviTutte.has(chiave)) return `La riga calcolata "${etichetta}" fa riferimento a "${chiave}", che non corrisponde a nessuna riga esistente.`
        }
      } else {
        if (c.formula.parti.length === 0) return `La riga calcolata "${etichetta}" non ha nessuna riga selezionata da sommare/mediare.`
        if (c.formula.parti.includes(c.key)) return `La riga calcolata "${etichetta}" non può riferirsi a se stessa.`
      }
    }
    return ''
  }

  async function handleSave() {
    const err = validate()
    if (err) {
      dispatch({ type: 'SAVE_ERROR', payload: err })
      return
    }
    dispatch({ type: 'START_SAVE' })
    try {
      const scala = getScalaEffettiva()
      const sanitized: FormState = {
        ...form,
        nome: sanitizzaStringa(form.nome),
        notaRange: sanitizzaStringa(form.notaRange),
        scalaDefault: scala,
        campiPrincipali: form.campiPrincipali.map(c => ({
          ...c,
          label: sanitizzaStringa(c.label),
          descr: sanitizzaStringa(c.descr),
        })),
        gruppiSecondari: form.gruppiSecondari.map(g => ({
          ...g,
          label: sanitizzaStringa(g.label),
          campi: g.campi.map(c => ({ ...c, label: sanitizzaStringa(c.label) })),
        })),
        colonne: form.colonne.map(c => ({ ...c, nome: sanitizzaStringa(c.nome) })),
      }
      await onSave(sanitized)
      dispatch({ type: 'SAVE_SUCCESS' })
    } catch (e: any) {
      dispatch({ type: 'SAVE_ERROR', payload: e.message || 'Errore durante il salvataggio.' })
    }
  }

  const tipiScala: { tipo: ScalaPunteggio['tipo']; label: string; desc: string }[] = [
    { tipo: 'qi_wisc', label: 'QI (media 100, DS 15)', desc: 'Come gli indici WISC-IV' },
    { tipo: 'scalare', label: 'Scalare (media 10, DS 3)', desc: 'Come i subtest NEPSY-II' },
    { tipo: 'soglie_custom', label: 'Soglie personalizzate', desc: 'Percentili, z-score, cut-off clinici...' },
  ]

  return (
    <div>
      {/* Nome e Categoria */}
      <div className="meta-row" style={{ marginBottom: 14 }}>
        <div className="form-group">
          <label className="form-label">Nome del test *</label>
          <input
            className="form-input"
            placeholder="es. BVN 5-11, TEMA-3, BVSCO..."
            value={form.nome}
            onChange={e => setField('nome', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Categoria</label>
          <select
            className="form-input"
            value={form.categoria}
            onChange={e => setField('categoria', e.target.value as any)}
            style={{ cursor: 'pointer' }}
          >
            <option value="cognitivo">Cognitivo</option>
            <option value="nepsy">Neuropsicologico (NEPSY-like)</option>
            <option value="apprendimenti">Apprendimenti</option>
            <option value="questionari">Questionari</option>
            <option value="altro">Altro</option>
          </select>
        </div>
      </div>

      {/* Scala di default */}
      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label">Scala di punteggio di default</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tipiScala.map(t => (
            <label key={t.tipo} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius)', border: `1px solid ${form.scalaDefault.tipo === t.tipo ? 'var(--accent)' : 'var(--border-md)'}`, background: form.scalaDefault.tipo === t.tipo ? 'var(--accent-lt)' : 'var(--bg-panel)', cursor: 'pointer' }}>
              <input type="radio" name="scala" checked={form.scalaDefault.tipo === t.tipo} onChange={() => setField('scalaDefault', t.tipo === 'soglie_custom' ? { tipo: 'soglie_custom', soglie: soglieCustom } : { tipo: t.tipo })} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t.desc}</div>
              </div>
            </label>
          ))}
        </div>
        {form.scalaDefault.tipo === 'soglie_custom' && (
          <div style={{ marginTop: 10, padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-panel)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Definisci le fasce</div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 80px 1fr 32px', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Min</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Max</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Etichetta</span>
              <span />
            </div>
            <EditorSoglieCustom soglie={soglieCustom} onChange={soglie => {
              dispatch({ type: 'SET_SOGLIE_CUSTOM', payload: soglie })
            }} />
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', marginTop: 10 }}>
          <input type="checkbox" checked={form.mostraCategoriaDescrittiva} onChange={e => setField('mostraCategoriaDescrittiva', e.target.checked)} />
          Mostra "Categoria descrittiva" (fascia di riga, da questa scala) come colonna nella tabella
        </label>
      </div>

      {/* Griglia: righe (campi principali) x colonne, con impostazioni per riga/colonna */}
      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label">Tabella dei punteggi *</label>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 10 }}>
          Clicca una riga o una colonna per configurarla. Le righe diventano le righe della tabella nella relazione, le colonne i valori da inserire per ciascuna.
        </p>
        <GrigliaTemplate form={form} dispatch={dispatch} tipiScala={tipiScala} />
      </div>

      {/* Gruppi secondari (subtest): facoltativo, collassato di default per non appesantire
          il percorso minimo di creazione di un test semplice (v. piano UX Fase 3). */}
      <details
        open={sezioneGruppiAperta}
        onToggle={e => setSezioneGruppiAperta((e.target as HTMLDetailsElement).open)}
        style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '2px 14px' }}
      >
        <summary style={{ cursor: 'pointer', padding: '10px 0', display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none' }}>
          <ChevronDown size={13} style={{ color: 'var(--text-muted)', transform: sezioneGruppiAperta ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
          <span className="form-label" style={{ margin: 0 }}>Gruppi secondari / subtest <span>(facoltativo{form.gruppiSecondari.length ? ` \u00b7 ${form.gruppiSecondari.length}` : ''})</span></span>
        </summary>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 10 }}>
          Ognuno genera una propria tabella nel DOCX (es. CBCL: "Scale Sindromiche", "Scale DSM Oriented"), oltre alla tabella principale. Non compaiono mai nella tabella principale stessa.
        </p>
        {form.gruppiSecondari.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Impaginazione delle tabelle secondarie nel DOCX</label>
            <select className="form-input" value={form.layoutTabelleSecondarie} onChange={e => setField('layoutTabelleSecondarie', e.target.value as 'interleaved' | 'raggruppato')} style={{ marginTop: 3, cursor: 'pointer' }}>
              <option value="interleaved">Ogni tabella seguita dalla sua descrizione (una alla volta)</option>
              <option value="raggruppato">Tutte le tabelle insieme, poi tutte le descrizioni</option>
            </select>
          </div>
        )}
        {form.gruppiSecondari.map((gruppo, gi) => (
          <details
            key={gi}
            open={!!gruppiAperti[gi]}
            onToggle={e => setGruppiAperti(prev => ({ ...prev, [gi]: (e.target as HTMLDetailsElement).open }))}
            style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '2px 12px' }}
          >
            <summary style={{ cursor: 'pointer', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none' }}>
              <ChevronDown size={13} style={{ color: 'var(--text-muted)', transform: gruppiAperti[gi] ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{gruppo.label || `Gruppo ${gi + 1}`}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{gruppo.campi.length} sottotest</span>
              <button type="button" onClick={() => removeGruppo(gi)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4 }}>
                <X size={13} />
              </button>
            </summary>
            <div style={{ paddingBottom: 10 }}>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nome gruppo</label>
                <input className="form-input" placeholder="es. Comprensione Verbale" value={gruppo.label} onChange={e => updateGruppo(gi, 'label', e.target.value)} style={{ marginTop: 3 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                {gruppo.campi.map((c, ci) => (
                  <div key={ci} style={{ display: 'grid', gridTemplateColumns: '1fr 28px', gap: 6, alignItems: 'flex-end' }}>
                    <div>
                      {ci === 0 && <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Etichetta</label>}
                      <input className="form-input" placeholder="es. Vocabolario" value={c.label} onChange={e => updateCampoGruppo(gi, ci, 'label', e.target.value)} style={{ marginTop: ci === 0 ? 3 : 0 }} />
                    </div>
                    <button type="button" onClick={() => removeCampoGruppo(gi, ci)} disabled={gruppo.campi.length <= 1} style={{ padding: 5, background: 'none', border: 'none', cursor: gruppo.campi.length > 1 ? 'pointer' : 'not-allowed', color: gruppo.campi.length > 1 ? 'var(--danger)' : 'var(--text-muted)', marginBottom: 2 }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addCampoGruppo(gi)} style={{ fontSize: 11.5, color: 'var(--accent)', background: 'none', border: '1px dashed var(--accent)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                + Subtest
              </button>
              {/* Identificativi interni: dettaglio tecnico per le formule, nascosto di default. */}
              <details style={{ marginTop: 10, fontSize: 11.5 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, listStyle: 'none' }}>
                  <Info size={12} /> Impostazioni avanzate (identificativi interni)
                </summary>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 2 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Identificativo del gruppo</label>
                    <input className="form-input" value={gruppo.key} onChange={e => updateGruppo(gi, 'key', e.target.value)} style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 12 }} />
                  </div>
                  {gruppo.campi.map((c, ci) => (
                    <div key={ci}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.label || `Sottotest ${ci + 1}`}</label>
                      <input className="form-input" placeholder="generato dall'etichetta" value={c.key} onChange={e => updateCampoGruppo(gi, ci, 'key', e.target.value)} style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 12 }} />
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </details>
        ))}
        <button type="button" onClick={addGruppo} style={{ marginTop: 4, fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px dashed var(--accent)', borderRadius: 'var(--radius)', padding: '5px 12px', cursor: 'pointer', width: '100%' }}>
          + Aggiungi gruppo secondario
        </button>
      </details>

      {/* Opzioni facoltative: nota metodologica e requisiti aggiuntivi del wizard, anch'esse
          collassate di default (v. piano UX Fase 3). */}
      <details
        open={sezioneOpzioniAperta}
        onToggle={e => setSezioneOpzioniAperta((e.target as HTMLDetailsElement).open)}
        style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '2px 14px' }}
      >
        <summary style={{ cursor: 'pointer', padding: '10px 0', display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none' }}>
          <ChevronDown size={13} style={{ color: 'var(--text-muted)', transform: sezioneOpzioniAperta ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
          <span className="form-label" style={{ margin: 0 }}>Opzioni aggiuntive <span>(facoltativo)</span></span>
        </summary>
        <div style={{ paddingBottom: 14 }}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nota range</label>
            <input
              className="form-input"
              placeholder="Testo della nota metodologica sui range (es. 'Il range medio corrisponde a…')"
              value={form.notaRange}
              onChange={e => setField('notaRange', e.target.value)}
              style={{ marginTop: 3 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.richiedeEtaValutazione} onChange={e => setField('richiedeEtaValutazione', e.target.checked)} />
              Richiede età al momento della valutazione
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.richiedeStrumentiUtilizzati} onChange={e => setField('richiedeStrumentiUtilizzati', e.target.checked)} />
              Richiede strumenti utilizzati
            </label>
          </div>
        </div>
      </details>

      {/* Anteprima */}
      <button type="button" onClick={() => dispatch({ type: 'TOGGLE_PREVIEW' })} style={{
        fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
      }}>
        <Eye size={13} /> {showPreview ? 'Nascondi anteprima' : 'Mostra anteprima'}
      </button>
      {showPreview && <Anteprima form={form} />}

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--danger-lt, #fee2e2)', border: '1px solid #f5c6c2', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
          {saving ? 'Salvataggio…' : 'Salva template'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  )
}

// ── Card singolo template ─────────────────────────────────────
function TemplateCard({ template, onDisattiva, onDelete, onEditSave, onEditCancel, onRiattiva, onDuplica, onTogglePredefinito }: { template: TestTemplate, onDisattiva?: () => void, onDelete?: () => void, onEditSave?: (form: FormState, id: string) => Promise<void>, onEditCancel?: () => void, onRiattiva?: () => void, onDuplica?: () => void, onTogglePredefinito?: () => void }) {
  const [expanded, setExpanded] = useState<'none' | 'details' | 'edit'>('none')
  const [menuAperto, setMenuAperto] = useState(false)
  // Azioni meno frequenti (Duplica, Rendi/Rimuovi predefinito, Elimina) raccolte in un
  // menu "···": ridurre da 6 a 3 pulsanti sempre visibili per non sovraccaricare la scelta
  // di chi usa la pagina saltuariamente. Disattiva/Riattiva resta primario perché reversibile
  // e frequente; Elimina resta nel menu perché raro e irreversibile.
  const haAzioniSecondarie = !!(onDuplica || onTogglePredefinito || onDelete)

  return (
    <div style={{
      border: `1px solid ${template.builtIn ? 'var(--accent)' : 'var(--border-md)'}`,
      borderRadius: 'var(--radius)', padding: '14px 16px',
      background: template.builtIn ? 'var(--accent-lt)' : 'var(--bg-panel)',
      opacity: template.attivo ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{template.nome}</span>
            {template.builtIn && (
              <span style={{ fontSize: 10.5, background: 'var(--accent)', color: '#fff', borderRadius: 12, padding: '1px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Lock size={10} /> predefinito
              </span>
            )}
            {!template.attivo && (
              <span style={{ fontSize: 10.5, background: 'var(--border)', color: 'var(--text-muted)', borderRadius: 12, padding: '1px 8px' }}>
                disattivato
              </span>
            )}
          </div>
            {template.categoria} · {template.campiPrincipali.length === 1 ? '1 campo principale' : `${template.campiPrincipali.length} campi principali`}
            {template.gruppiSecondari?.length ? ` · ${template.gruppiSecondari.length} ${template.gruppiSecondari.length === 1 ? 'gruppo secondario' : 'gruppi secondari'}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
          <button type="button" onClick={() => setExpanded(v => v === 'details' ? 'none' : 'details')} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {expanded === 'details' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded === 'details' ? 'Chiudi' : 'Dettagli'}
          </button>
          {onEditSave && (
            <button type="button" onClick={() => setExpanded(v => v === 'edit' ? 'none' : 'edit')} style={{ background: 'none', border: `1px solid ${expanded === 'edit' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: expanded === 'edit' ? 'var(--accent)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Pencil size={13} /> {expanded === 'edit' ? 'Annulla modifica' : 'Modifica'}
            </button>
          )}
          {onRiattiva && (
            <button type="button" onClick={onRiattiva} title="Torna a comparire nel wizard per le nuove relazioni" style={{ background: 'none', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Riattiva
            </button>
          )}
          {template.attivo && onDisattiva && (
            <button type="button" onClick={onDisattiva} title="Reversibile: puoi riattivarlo quando vuoi, non elimina nulla" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Disattiva
            </button>
          )}

          {haAzioniSecondarie && (
            <div style={{ marginLeft: 'auto', position: 'relative' }}>
              <button
                type="button"
                onClick={() => setMenuAperto(v => !v)}
                title="Altre azioni"
                aria-label="Altre azioni"
                aria-haspopup="menu"
                aria-expanded={menuAperto}
                style={{ background: menuAperto ? 'var(--accent-lt)' : 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
              >
                <MoreVertical size={14} />
              </button>
              {menuAperto && (
                <>
                  {/* Backdrop invisibile per chiudere il menu cliccando fuori */}
                  <div onClick={() => setMenuAperto(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                  <div role="menu" style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 21,
                    background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    boxShadow: 'var(--shadow-md, 0 8px 20px rgba(0,0,0,0.12))', minWidth: 200, overflow: 'hidden',
                  }}>
                    {onDuplica && (
                      <button role="menuitem" type="button" onClick={() => { setMenuAperto(false); onDuplica() }} title="Crea una copia personalizzata" style={{ width: '100%', background: 'none', border: 'none', padding: '9px 12px', cursor: 'pointer', fontSize: 12.5, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                        <Copy size={13} /> Duplica
                      </button>
                    )}
                    {onTogglePredefinito && (
                      <button role="menuitem" type="button" onClick={() => { setMenuAperto(false); onTogglePredefinito() }} title={template.builtIn ? 'Rimuove lo stato di predefinito: resta un template normale' : 'Lo rende predefinito, come WISC-IV/NEPSY-II'} style={{ width: '100%', background: 'none', border: 'none', padding: '9px 12px', cursor: 'pointer', fontSize: 12.5, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                        {template.builtIn ? <><Unlock size={13} /> Rimuovi da predefiniti</> : <><Lock size={13} /> Rendi predefinito</>}
                      </button>
                    )}
                    {onDelete && (
                      <button role="menuitem" type="button" onClick={() => { setMenuAperto(false); onDelete() }} title="Azione irreversibile: elimina per sempre" style={{ width: '100%', background: 'none', border: 'none', borderTop: '1px solid var(--border)', padding: '9px 12px', cursor: 'pointer', fontSize: 12.5, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                        <Trash2 size={13} /> Elimina per sempre
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {expanded === 'details' && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            Scala: <strong>{template.scalaDefault.tipo === 'qi_wisc' ? 'QI (media 100)' : template.scalaDefault.tipo === 'scalare' ? 'Scalare (media 10)' : 'Soglie personalizzate'}</strong>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Campi principali:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {template.campiPrincipali.map(c => (
              <span key={c.key} style={{ fontSize: 11.5, background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px' }}>
                {c.label}
              </span>
            ))}
          </div>
          {template.gruppiSecondari && template.gruppiSecondari.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Gruppi secondari (narrativa):</div>
              {template.gruppiSecondari.map(g => (
                <div key={g.key} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>
                  <strong>{g.label}</strong>: {g.campi.map(c => c.label).join(', ')}
                </div>
              ))}
            </div>
          )}
          {template.notaRange && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Nota range: {template.notaRange.substring(0, 120)}{template.notaRange.length > 120 ? '…' : ''}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Anteprima form={templateToForm(template)} />
          </div>
        </div>
      )}

      {expanded === 'edit' && onEditSave && (
        <div style={{ marginTop: 12, borderTop: `1px solid var(--accent)`, paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-dk)', marginBottom: 12 }}>
            Modifica template
          </div>
          <FormTemplate
            initial={templateToForm(template)}
            onSave={async (form) => {
              await onEditSave(form, template.id)
              setExpanded('none')
            }}
            onCancel={() => {
              onEditCancel?.()
              setExpanded('none')
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Pagina principale ─────────────────────────────────────────
export default function GestioneTest() {
  const [state, dispatch] = useReducer(gestioneTestReducer, GESTIONE_TEST_INIT)
  // Punto di partenza guidato per un nuovo template (Fase 4): mostrato prima del form
  // vuoto, solo per la creazione manuale (non per i flussi già assistiti dall'AI).
  const [showPresetPicker, setShowPresetPicker] = useState(false)

  const {
    templates,
    loading,
    showForm,
    formInitial,
    editingTemplateId,
    confirmDisattiva,
    confirmDelete,
    profilo,
    successo,
    suggerimenti,
    suggerimentiProfilo,
    loadingProfilo,
    erroreProfilo,
    loadingEstraiTest,
    accordionAperto,
  } = state

  useEffect(() => {
    Promise.all([
      getTestTemplates(),
      getProfiloProfessionista(),
      getTemplateRilevati(),
    ]).then(([t, prof, rilevati]) => {
      dispatch({
        type: 'LOAD_DATA_SUCCESS',
        payload: { templates: t, profilo: prof, suggerimentiProfilo: rilevati },
      })
    })
  }, [])

  function precompilaDaSuggerimento(nome: string) {
    dispatch({
      type: 'OPEN_EDIT_FORM',
      payload: { initial: { ...INIT_FORM, nome }, id: '' }
    })
    dispatch({
      type: 'SET_SUGGERIMENTI',
      payload: suggerimenti.filter(x => x !== nome),
    })
  }

  async function handleEstraiDaProfilo() {
    dispatch({ type: 'START_ESTRAZIONE_PROFILO' })
    try {
      const profiloStile = await getProfiloStile()
      if (!profiloStile || !profiloStile.trim()) {
        dispatch({
          type: 'ESTRAZIONE_PROFILO_ERROR',
          payload: 'Nessun Profilo di Stile trovato. Generalo prima nella pagina "Il mio stile".',
        })
        setTimeout(() => dispatch({ type: 'ESTRAZIONE_PROFILO_ERROR', payload: '' }), 5000)
        return
      }
      const nomiEsistenti = templates.map(t => t.nome)
      const res = await rilevaNomiTestDaProfilo(profiloStile, nomiEsistenti)
      if (res.length === 0) {
        dispatch({
          type: 'ESTRAZIONE_PROFILO_SUCCESS',
          payload: { suggerimentiProfilo: [], successo: 'Nessun nuovo test template rilevato nel tuo Profilo di Stile.' },
        })
        setTimeout(() => dispatch({ type: 'CLEAR_SUCCESS_MSG' }), 4000)
        // Azzera anche quelli salvati, così la UI è coerente
        await clearTemplateRilevati()
      } else {
        // Rimpiazza sempre (non additivo)
        await saveTemplateRilevati(res)
        dispatch({
          type: 'ESTRAZIONE_PROFILO_SUCCESS',
          payload: { suggerimentiProfilo: res },
        })
      }
    } catch (e: any) {
      console.error(e)
      dispatch({
        type: 'ESTRAZIONE_PROFILO_ERROR',
        payload: 'Errore durante l\'estrazione: ' + e.message,
      })
      setTimeout(() => dispatch({ type: 'ESTRAZIONE_PROFILO_ERROR', payload: '' }), 5000)
    }
  }

  async function precompilaDaProfilo(nome: string) {
    dispatch({ type: 'START_PRECOMPILAZIONE', payload: nome })
    try {
      const profiloStile = await getProfiloStile()
      if (!profiloStile || !profiloStile.trim()) {
        dispatch({ type: 'PRECOMPILAZIONE_ERROR', payload: 'Nessun Profilo di Stile trovato.' })
        return
      }
      const t = await generaTemplateTest(nome, profiloStile)
      if (!t) {
        dispatch({
          type: 'PRECOMPILAZIONE_ERROR',
          payload: `Impossibile generare il template dettagliato per il test "${nome}".`,
        })
        return
      }
      const initial: FormState = {
        nome: t.nome || nome,
        categoria: t.categoria || 'altro',
        scalaDefault: t.scalaDefault || { tipo: 'scalare' },
        mostraCategoriaDescrittiva: true,
        layoutTabelleSecondarie: 'interleaved',
        campiPrincipali: (t.campiPrincipali || []).map((c: any) => ({ key: c.key, label: c.label, descr: c.descr || '', scala: c.scala })),
        gruppiSecondari: (t.gruppiSecondari || []).map((g: any) => ({ key: g.key, label: g.label, campi: (g.campi || []).map((c: any) => ({ key: c.key, label: c.label })) })),
        colonne: t.colonne && t.colonne.length > 0 ? t.colonne.map((nome: string) => ({ nome })) : [{ nome: 'Punteggio' }],
        notaRange: t.notaRange || '',
        richiedeEtaValutazione: t.richiedeEtaValutazione ?? false,
        richiedeStrumentiUtilizzati: t.richiedeStrumentiUtilizzati ?? false,
      }
      // Rimuovi questo item dai suggerimenti salvati
      const aggiornati = suggerimentiProfilo.filter(x => x.nome !== nome)
      await saveTemplateRilevati(aggiornati)
      dispatch({
        type: 'PRECOMPILAZIONE_SUCCESS',
        payload: { initial, suggerimentiProfilo: aggiornati },
      })
    } catch (e: any) {
      console.error(e)
      dispatch({
        type: 'PRECOMPILAZIONE_ERROR',
        payload: 'Errore durante la generazione del template: ' + e.message,
      })
    }
  }

  // Separa i campiPrincipali "puliti" (senza il sotto-oggetto formula, che è solo
  // rappresentazione del form) dalle formule compilate in TestTemplate['formule'].
  function costruisciCampiEFormule(campiPrincipali: FormCampo[]): { campiPrincipali: CampoTest[]; formule: FormulaCalcolo[] } {
    const formule: FormulaCalcolo[] = []
    const campi: CampoTest[] = campiPrincipali.map(({ formula, ...c }) => {
      if (formula) {
        formule.push({
          targetKey: c.key,
          espressione: formula.modo === 'avanzata' ? formula.espressioneAvanzata : buildFormulaSemplice(formula.modo, formula.parti),
          descrizione: formula.descrizione || undefined,
        })
      }
      return c
    })
    return { campiPrincipali: campi, formule }
  }

  async function handleSave(form: FormState, editingId: string | null = null) {
    const id = editingId ?? editingTemplateId
    const { campiPrincipali, formule } = costruisciCampiEFormule(form.campiPrincipali)
    if (id) {
      // Modalità modifica
      await updateTestTemplate(id, {
        nome: sanitizzaStringa(form.nome),
        categoria: form.categoria,
        scalaDefault: form.scalaDefault,
        mostraCategoriaDescrittiva: form.mostraCategoriaDescrittiva,
        layoutTabelleSecondarie: form.layoutTabelleSecondarie,
        campiPrincipali,
        gruppiSecondari: form.gruppiSecondari.length > 0 ? form.gruppiSecondari as GruppoTest[] : undefined,
        colonne: form.colonne as ColonnaTest[],
        notaRange: form.notaRange || undefined,
        richiedeEtaValutazione: form.richiedeEtaValutazione,
        richiedeStrumentiUtilizzati: form.richiedeStrumentiUtilizzati,
        formule: formule.length > 0 ? formule : undefined,
      })
      const updated = await getTestTemplates()
      dispatch({
        type: 'OPERATION_SUCCESS',
        payload: { templates: updated, successo: `Template "${sanitizzaStringa(form.nome)}" aggiornato con successo.` },
      })
      dispatch({ type: 'CLOSE_FORM' })
      setTimeout(() => dispatch({ type: 'CLEAR_SUCCESS_MSG' }), 4000)
      return
    }
    // Modalità creazione
    const nuovoTemplate = await insertTestTemplate({
      nome: sanitizzaStringa(form.nome),
      categoria: form.categoria,
      scalaDefault: form.scalaDefault,
      mostraCategoriaDescrittiva: form.mostraCategoriaDescrittiva,
      layoutTabelleSecondarie: form.layoutTabelleSecondarie,
      campiPrincipali,
      gruppiSecondari: form.gruppiSecondari.length > 0 ? form.gruppiSecondari as GruppoTest[] : undefined,
      notaRange: form.notaRange || undefined,
      richiedeEtaValutazione: form.richiedeEtaValutazione,
      richiedeStrumentiUtilizzati: form.richiedeStrumentiUtilizzati,
      attivo: true,
      schemaVersion: 1,
      colonne: form.colonne as ColonnaTest[],
      formule: formule.length > 0 ? formule : undefined,
    })
    const updated = await getTestTemplates()
    dispatch({
      type: 'OPERATION_SUCCESS',
      payload: { templates: updated, successo: `Template "${nuovoTemplate.nome}" aggiunto con successo.` },
    })
    dispatch({ type: 'CLOSE_FORM' })
    setTimeout(() => dispatch({ type: 'CLEAR_SUCCESS_MSG' }), 4000)
  }

  async function handleDuplica(template: TestTemplate) {
    const copia = await duplicaTestTemplate(template)
    const updated = await getTestTemplates()
    dispatch({
      type: 'OPERATION_SUCCESS',
      payload: { templates: updated, successo: `"${template.nome}" duplicato in "${copia.nome}", personalizzabile liberamente.` },
    })
    dispatch({ type: 'OPEN_EDIT_FORM', payload: { initial: templateToForm(copia), id: copia.id } })
    setTimeout(() => dispatch({ type: 'CLEAR_SUCCESS_MSG' }), 4000)
  }

  async function handleTogglePredefinito(template: TestTemplate) {
    await updateTestTemplate(template.id, { builtIn: !template.builtIn })
    const updated = await getTestTemplates()
    dispatch({
      type: 'OPERATION_SUCCESS',
      payload: {
        templates: updated,
        successo: template.builtIn
          ? `"${template.nome}" non è più un template predefinito.`
          : `"${template.nome}" è ora un template predefinito.`,
      },
    })
    setTimeout(() => dispatch({ type: 'CLEAR_SUCCESS_MSG' }), 4000)
  }

  async function handleDisattiva(id: string) {
    await disattivaTestTemplate(id)
    const updated = await getTestTemplates()
    dispatch({
      type: 'OPERATION_SUCCESS',
      payload: { templates: updated, successo: 'Template disattivato. Non comparirà più nel wizard.' },
    })
    dispatch({ type: 'SET_CONFIRM_DISATTIVA', payload: null })
    setTimeout(() => dispatch({ type: 'CLEAR_SUCCESS_MSG' }), 4000)
  }

  async function handleRiattiva(id: string) {
    await updateTestTemplate(id, { attivo: true })
    const updated = await getTestTemplates()
    dispatch({
      type: 'OPERATION_SUCCESS',
      payload: { templates: updated, successo: 'Template riattivato. Comparirà di nuovo nel wizard.' },
    })
    setTimeout(() => dispatch({ type: 'CLEAR_SUCCESS_MSG' }), 4000)
  }

  async function handleDelete(id: string) {
    await deleteTestTemplate(id)
    const updated = await getTestTemplates()
    dispatch({
      type: 'OPERATION_SUCCESS',
      payload: { templates: updated, successo: 'Template eliminato definitivamente.' },
    })
    dispatch({ type: 'SET_CONFIRM_DELETE', payload: null })
    setTimeout(() => dispatch({ type: 'CLEAR_SUCCESS_MSG' }), 4000)
  }

  const attivi = templates.filter(t => t.attivo).sort((a, b) => (a.builtIn === b.builtIn ? 0 : a.builtIn ? -1 : 1))
  const disattivati = templates.filter(t => !t.attivo)

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Gestione Test</div>
          <div className="topbar-sub">
            Template per test neuropsicologici strutturati
          </div>
        </div>
      </div>

      <div className="page-body">
        {USE_MOCK && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <FlaskConical size={15} style={{ flexShrink: 0 }} />
            <span>
              Modalità demo — i template creati qui sono salvati solo in memoria
              e si azzerano al refresh.
            </span>
          </div>
        )}

        {successo && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: "#ecfdf5",
              border: "1px solid #6ee7b7",
              borderRadius: "var(--radius)",
              color: "#065f46",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Check size={14} /> {successo}
          </div>
        )}

        {/* Info */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 6,
              color: "var(--accent-dk)",
            }}
          >
            Template configurabili
          </h3>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            I template <strong>predefiniti</strong> (WISC-IV, NEPSY-II) non
            possono essere eliminati né rinominati, ma possono essere
            disattivati se non utilizzati. I template{" "}
            <strong>personalizzati</strong> creati qui compariono nel wizard e
            generano tabelle e narrative automatiche nella relazione. La qualità
            narrativa dipende dalla completezza delle frasi descrittive inserite
            per ciascun campo.
          </p>
        </div>

        {/* Lista template attivi */}
        {loading ? (
          <div
            className="card"
            style={{ textAlign: "center", padding: "32px 0" }}
          >
            <span
              className="spinner"
              style={{
                width: 22,
                height: 22,
                margin: "0 auto 8px",
                display: "block",
              }}
            />
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Caricamento template…
            </p>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--accent-dk)",
                  margin: 0,
                }}
              >
                Template attivi ({attivi.length})
              </h3>
              {!showForm && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleEstraiDaProfilo}
                    disabled={loadingProfilo}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {loadingProfilo ? (
                      <span
                        className="spinner"
                        style={{ width: 14, height: 14 }}
                      />
                    ) : (
                      <Sparkles size={14} color="var(--accent)" />
                    )}
                    {loadingProfilo ? "Estrazione..." : "Estrai da Profilo"}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowPresetPicker(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Plus size={14} /> Nuovo template
                  </button>
                </div>
              )}
            </div>

            {erroreProfilo && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "10px 14px",
                  background: "var(--danger-lt, #fee2e2)",
                  border: "1px solid #f5c6c2",
                  borderRadius: "var(--radius)",
                  color: "var(--danger)",
                  fontSize: 12.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <AlertTriangle size={14} /> {erroreProfilo}
              </div>
            )}

            {suggerimentiProfilo.length > 0 && !showForm && (
              <div
                style={{
                  marginBottom: 16,
                  border: "1px solid var(--accent)",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                }}
              >
                {/* Header accordion */}
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_ACCORDION_APERTO', payload: !accordionAperto })}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    background: "var(--accent-lt)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <Sparkles size={14} color="var(--accent)" />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--accent-dk)",
                      flex: 1,
                    }}
                  >
                    Template rilevati nel tuo Profilo di Stile (
                    {suggerimentiProfilo.length})
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginRight: 6,
                    }}
                  >
                    clicca per creare
                  </span>
                  {accordionAperto ? (
                    <ChevronUp size={14} color="var(--accent)" />
                  ) : (
                    <ChevronDown size={14} color="var(--accent)" />
                  )}
                </button>

                {/* Corpo accordion */}
                {accordionAperto && (
                  <div
                    style={{
                      padding: "12px 14px",
                      background: "var(--bg-panel)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      {suggerimentiProfilo.map((t) => {
                        const isExtracting = loadingEstraiTest === t.nome;
                        return (
                          <button
                            key={t.nome}
                            type="button"
                            onClick={() => precompilaDaProfilo(t.nome)}
                            disabled={!!loadingEstraiTest}
                            style={{
                              background: "var(--bg-panel)",
                              border: "1px solid var(--accent)",
                              borderRadius: 10,
                              padding: "8px 14px",
                              fontSize: 12,
                              color: "var(--text)",
                              cursor: isExtracting ? "default" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              textAlign: "left",
                              boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                              transition: "all 0.15s",
                              opacity:
                                loadingEstraiTest && !isExtracting ? 0.6 : 1,
                            }}
                          >
                            {isExtracting ? (
                              <span
                                className="spinner"
                                style={{ width: 14, height: 14, flexShrink: 0 }}
                              />
                            ) : (
                              <Plus
                                size={16}
                                color="var(--accent)"
                                style={{ flexShrink: 0 }}
                              />
                            )}
                            <div>
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: "var(--accent-dk)",
                                }}
                              >
                                {t.nome}
                              </div>
                              <div
                                style={{
                                  fontSize: 10.5,
                                  color: "var(--text-muted)",
                                  textTransform: "capitalize",
                                }}
                              >
                                {t.categoria} · Clicca per estrarre struttura
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await clearTemplateRilevati();
                        dispatch({ type: 'CLEAR_SUGGERIMENTI_PROFILO' });
                      }}
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-muted)",
                        background: "none",
                        border: "1px dashed var(--border)",
                        borderRadius: 6,
                        padding: "3px 10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <X size={12} /> Svuota suggerimenti
                    </button>
                  </div>
                )}
              </div>
            )}

            {suggerimenti.length > 0 && !showForm && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  background: "var(--accent-lt)",
                  border: "1px solid var(--accent)",
                  borderRadius: "var(--radius)",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--accent-dk)",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Sparkles size={14} /> Test rilevati nelle tue relazioni
                  (bozze)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {suggerimenti.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => precompilaDaSuggerimento(s)}
                      style={{
                        background: "var(--bg-panel)",
                        border: "1px solid var(--accent)",
                        borderRadius: 14,
                        padding: "4px 10px",
                        fontSize: 12,
                        color: "var(--text)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Plus size={12} color="var(--accent)" /> {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Punto di partenza guidato per un nuovo template (Fase 4): proposto solo per
                la creazione manuale, prima di mostrare il form vuoto. Ogni opzione è solo
                un precompilamento di comodo, resta tutto modificabile liberamente dopo. */}
            {showPresetPicker && !showForm && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "16px",
                  border: "1px solid var(--accent)",
                  borderRadius: "var(--radius)",
                  background: "var(--accent-lt)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-dk)", marginBottom: 4 }}>
                  Da dove parti?
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
                  Sono solo punti di partenza: puoi comunque aggiungere, rinominare o togliere righe e colonne dopo.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {PRESET_TEMPLATES.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'OPEN_EDIT_FORM', payload: { initial: preset.form, id: '' } })
                        setShowPresetPicker(false)
                      }}
                      style={{
                        textAlign: "left",
                        background: "var(--bg-panel)",
                        border: "1px solid var(--border-md)",
                        borderRadius: "var(--radius)",
                        padding: "10px 14px",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{preset.nome}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{preset.descrizione}</div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'OPEN_CREATE_FORM' })
                      setShowPresetPicker(false)
                    }}
                    style={{
                      textAlign: "left",
                      background: "none",
                      border: "1px dashed var(--border-md)",
                      borderRadius: "var(--radius)",
                      padding: "10px 14px",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      fontSize: 12.5,
                    }}
                  >
                    Parti da zero
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPresetPicker(false)}
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 10 }}
                >
                  Annulla
                </button>
              </div>
            )}

            {/* Form creazione / modifica */}
            {showForm && (
              <div
                style={{
                  border: "1px solid var(--accent)",
                  borderRadius: "var(--radius)",
                  padding: "18px 16px",
                  marginBottom: 16,
                  background: "var(--accent-lt)",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--accent-dk)",
                    marginBottom: 14,
                  }}
                >
                  {editingTemplateId
                    ? `Modifica template`
                    : "Nuovo template di test"}
                </div>
                <FormTemplate
                  initial={formInitial}
                  onSave={handleSave}
                  onCancel={() => dispatch({ type: 'CLOSE_FORM' })}
                />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {attivi.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onEditSave={handleSave}
                  onEditCancel={() => dispatch({ type: 'CLOSE_FORM' })}
                  onDisattiva={() => dispatch({ type: 'SET_CONFIRM_DISATTIVA', payload: t.id })}
                  onDuplica={() => handleDuplica(t)}
                  onTogglePredefinito={() => handleTogglePredefinito(t)}
                  onDelete={() => dispatch({ type: 'SET_CONFIRM_DELETE', payload: t.id })}
                />
              ))}
              {attivi.length === 0 && (
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 13,
                    textAlign: "center",
                    padding: "20px 0",
                  }}
                >
                  Nessun template attivo.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Template disattivati */}
        {disattivati.length > 0 && (
          <div className="card">
            <h3
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-muted)",
                marginBottom: 12,
              }}
            >
              Template disattivati ({disattivati.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {disattivati.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onRiattiva={() => handleRiattiva(t.id)}
                  onDuplica={() => handleDuplica(t)}
                  onTogglePredefinito={() => handleTogglePredefinito(t)}
                  onDelete={() => dispatch({ type: 'SET_CONFIRM_DELETE', payload: t.id })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Confirm dialog disattivazione */}
        {confirmDisattiva && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: "var(--bg-panel)",
                borderRadius: 12,
                padding: "28px 32px",
                maxWidth: 400,
                width: "90%",
                boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <AlertTriangle size={20} color="var(--danger)" />
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  Disattiva template
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                  marginBottom: 20,
                }}
              >
                Il template verrà disattivato e non apparirà più nel wizard per
                le nuove relazioni. Le relazioni già generate non vengono
                modificate. È un'azione reversibile: potrai riattivarlo quando
                vuoi dalla lista dei template disattivati, in fondo alla pagina.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn btn-primary"
                  style={{
                    background: "var(--danger)",
                    borderColor: "var(--danger)",
                  }}
                  onClick={() => handleDisattiva(confirmDisattiva)}
                >
                  Disattiva
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => dispatch({ type: 'SET_CONFIRM_DISATTIVA', payload: null })}
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm dialog eliminazione */}
        {confirmDelete &&
          (() => {
            const genere = String(profilo?.genere || "")
              .trim()
              .toLowerCase();
            const sicuroMsg =
              genere === "uomo"
                ? "Sei sicuro di voler eliminare questo template?"
                : genere === "donna"
                  ? "Sei sicura di voler eliminare questo template?"
                  : "Sei sicurə di voler eliminare questo template?";

            return (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    background: "var(--bg-panel)",
                    borderRadius: 12,
                    padding: "28px 32px",
                    maxWidth: 400,
                    width: "90%",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <AlertTriangle size={20} color="var(--danger)" />
                    <span style={{ fontSize: 15, fontWeight: 600 }}>
                      Elimina template
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--text-muted)",
                      lineHeight: 1.6,
                      marginBottom: 20,
                    }}
                  >
                    {sicuroMsg} Questa azione è irreversibile e rimuoverà
                    definitivamente il template dal database. Se ti serve solo
                    smettere di usarlo ma poterlo recuperare in futuro, chiudi
                    questa finestra e scegli invece "Disattiva".
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="btn btn-primary"
                      style={{
                        background: "var(--danger)",
                        borderColor: "var(--danger)",
                      }}
                      onClick={() => handleDelete(confirmDelete)}
                    >
                      Elimina
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => dispatch({ type: 'SET_CONFIRM_DELETE', payload: null })}
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>
    </>
  );
}
