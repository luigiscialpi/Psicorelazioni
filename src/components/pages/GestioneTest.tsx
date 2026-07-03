import { useState, useEffect, useReducer } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Eye, Save, AlertTriangle, Lock, FlaskConical, X, GripVertical, Check, Sparkles, Pencil } from 'lucide-react'
import {
  getTestTemplates, insertTestTemplate, updateTestTemplate, disattivaTestTemplate, deleteTestTemplate
} from '../../data/testTemplatesData'
import { validaSoglieCustom } from '../../services/testTemplateEngine'
import { suggerisciTestDaArchivio, rilevaNomiTestDaProfilo, generaTemplateTest } from '../../services/geminiService'
import { getRelazioni } from '../../data/relazioniData'
import { getProfiloProfessionista, getProfiloStile } from '../../data/profiloData'
import type { ProfiloProfessionista } from '../../core/types'
import type { TestTemplate, CampoTest, GruppoTest, SogliaCustom, ScalaPunteggio } from '../../core/testTemplate'
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

// ── Form state types ──────────────────────────────────────────
type FormState = {
  nome: string
  categoria: TestTemplate['categoria']
  scalaDefault: ScalaPunteggio
  campiPrincipali: Array<{ key: string; label: string; descr: string }>
  gruppiSecondari: Array<{ key: string; label: string; campi: Array<{ key: string; label: string }> }>
  notaRange: string
  richiedeEtaValutazione: boolean
  richiedeStrumentiUtilizzati: boolean
}

const INIT_FORM: FormState = {
  nome: '',
  categoria: 'altro',
  scalaDefault: { tipo: 'scalare' },
  campiPrincipali: [{ key: '', label: '', descr: '' }],
  gruppiSecondari: [],
  notaRange: '',
  richiedeEtaValutazione: false,
  richiedeStrumentiUtilizzati: false,
}

// ── Generazione slug automatica ───────────────────────────────
function toSlug(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
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

  return (
    <div style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Anteprima (valori fittizi)
      </div>
      {/* Tabella */}
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Tabella</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 14 }}>
        <thead>
          <tr style={{ background: 'var(--accent-lt)' }}>
            <th style={{ textAlign: 'left', padding: '5px 8px', border: '1px solid var(--border)' }}>{form.nome || 'Test'} scale</th>
            <th style={{ padding: '5px 8px', border: '1px solid var(--border)' }}>Punteggio</th>
            <th style={{ padding: '5px 8px', border: '1px solid var(--border)' }}>Categoria descrittiva</th>
          </tr>
        </thead>
        <tbody>
          {form.campiPrincipali.slice(0, 3).filter(c => c.label).map((c, i) => (
            <tr key={i}>
              <td style={{ padding: '5px 8px', border: '1px solid var(--border)' }}>{c.label}</td>
              <td style={{ padding: '5px 8px', border: '1px solid var(--border)', textAlign: 'center' }}>{val + i * 3}</td>
              <td style={{ padding: '5px 8px', border: '1px solid var(--border)', textAlign: 'center' }}>{anteprimaFascia(form.scalaDefault, val + i * 3)}</td>
            </tr>
          ))}
          {!form.campiPrincipali.some(c => c.label) && (
            <tr><td colSpan={3} style={{ padding: '5px 8px', border: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'center' }}>Aggiungi campi per vedere l'anteprima</td></tr>
          )}
        </tbody>
      </table>
      {/* Narrativa */}
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Narrativa (esempio)</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
        {campo?.label
          ? (campo.descr
              ? campo.descr.replace(/\b(WISC|NEPSY)\b/gi, form.nome || 'test')
              : `Il punteggio ottenuto al test ${campo.label} è ${val}, fascia ${fascia.toLowerCase()}.`)
          : 'Aggiungi un campo con descrizione per vedere la narrativa generata.'}
      </p>
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
  const [form, setForm] = useState<FormState>(initial || INIT_FORM)
  const [soglieCustom, setSoglieCustom] = useState<SogliaCustom[]>(
    initial?.scalaDefault.tipo === 'soglie_custom' ? initial.scalaDefault.soglie : []
  )
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function addCampo() {
    setForm(f => ({ ...f, campiPrincipali: [...f.campiPrincipali, { key: '', label: '', descr: '' }] }))
  }
  function removeCampo(i: number) {
    setForm(f => ({ ...f, campiPrincipali: f.campiPrincipali.filter((_, idx) => idx !== i) }))
  }
  function updateCampo(i: number, field: string, v: string) {
    const next = form.campiPrincipali.map((c, idx) => {
      if (idx !== i) return c
      const updated = { ...c, [field]: v }
      // auto-genera chiave dal label se la chiave è vuota o era auto-generata
      if (field === 'label') updated.key = toSlug(v)
      return updated
    })
    setForm(f => ({ ...f, campiPrincipali: next }))
  }

  function addGruppo() {
    setForm(f => ({ ...f, gruppiSecondari: [...f.gruppiSecondari, { key: '', label: '', campi: [{ key: '', label: '' }] }] }))
  }
  function removeGruppo(i: number) {
    setForm(f => ({ ...f, gruppiSecondari: f.gruppiSecondari.filter((_, idx) => idx !== i) }))
  }
  function updateGruppo(i: number, field: string, v: string) {
    const next = form.gruppiSecondari.map((g, idx) => {
      if (idx !== i) return g
      const updated = { ...g, [field]: v }
      if (field === 'label') updated.key = toSlug(v)
      return updated
    })
    setForm(f => ({ ...f, gruppiSecondari: next }))
  }
  function addCampoGruppo(gi: number) {
    const next = form.gruppiSecondari.map((g, idx) =>
      idx === gi ? { ...g, campi: [...g.campi, { key: '', label: '' }] } : g
    )
    setForm(f => ({ ...f, gruppiSecondari: next }))
  }
  function removeCampoGruppo(gi: number, ci: number) {
    const next = form.gruppiSecondari.map((g, idx) =>
      idx === gi ? { ...g, campi: g.campi.filter((_, cidx) => cidx !== ci) } : g
    )
    setForm(f => ({ ...f, gruppiSecondari: next }))
  }
  function updateCampoGruppo(gi: number, ci: number, field: string, v: string) {
    const next = form.gruppiSecondari.map((g, gidx) => {
      if (gidx !== gi) return g
      const nuoviCampi = g.campi.map((c, cidx) => {
        if (cidx !== ci) return c
        const updated = { ...c, [field]: v }
        if (field === 'label') updated.key = toSlug(v)
        return updated
      })
      return { ...g, campi: nuoviCampi }
    })
    setForm(f => ({ ...f, gruppiSecondari: next }))
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
    return ''
  }

  async function handleSave() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setSaving(true)
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
      }
      await onSave(sanitized)
    } catch (e: any) {
      setError(e.message || 'Errore durante il salvataggio.')
    } finally {
      setSaving(false)
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
              setSoglieCustom(soglie)
              setField('scalaDefault', { tipo: 'soglie_custom', soglie })
            }} />
          </div>
        )}
      </div>

      {/* Campi principali */}
      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label">Campi principali (indici / scale) *</label>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 10 }}>
          Questi campi genereranno le righe della tabella nella relazione.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {form.campiPrincipali.map((campo, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', background: 'var(--bg-panel)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 8, marginBottom: 6 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Etichetta *</label>
                  <input className="form-input" placeholder="es. Comprensione Verbale (ICV)" value={campo.label} onChange={e => updateCampo(i, 'label', e.target.value)} style={{ marginTop: 3 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Chiave (slug auto)</label>
                  <input className="form-input" placeholder="es. icv" value={campo.key} onChange={e => updateCampo(i, 'key', e.target.value)} style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 12 }} />
                </div>
                <button type="button" onClick={() => removeCampo(i)} disabled={form.campiPrincipali.length <= 1} style={{ alignSelf: 'flex-end', padding: 5, background: 'none', border: 'none', cursor: form.campiPrincipali.length > 1 ? 'pointer' : 'not-allowed', color: form.campiPrincipali.length > 1 ? 'var(--danger)' : 'var(--text-muted)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Frase descrittiva narrativa (facoltativa)</label>
                <input className="form-input" placeholder="es. La prestazione nell'ambito della comprensione verbale è risultata..." value={campo.descr} onChange={e => updateCampo(i, 'descr', e.target.value)} style={{ marginTop: 3 }} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addCampo} style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px dashed var(--accent)', borderRadius: 'var(--radius)', padding: '5px 12px', cursor: 'pointer', width: '100%' }}>
          + Aggiungi campo principale
        </button>
      </div>

      {/* Gruppi secondari (subtest) */}
      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label">Gruppi secondari / subtest <span>(facoltativo)</span></label>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 10 }}>
          Questi compariranno <strong>solo come testo narrativo</strong>, mai in tabella.
        </p>
        {form.gruppiSecondari.map((gruppo, gi) => (
          <details key={gi} open style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '2px 12px' }}>
            <summary style={{ cursor: 'pointer', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{gruppo.label || `Gruppo ${gi + 1}`}</span>
              <button type="button" onClick={() => removeGruppo(gi)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4 }}>
                <X size={13} />
              </button>
            </summary>
            <div style={{ paddingBottom: 10 }}>
              <div className="meta-row" style={{ marginBottom: 8 }}>
                <div className="form-group">
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nome gruppo</label>
                  <input className="form-input" placeholder="es. Comprensione Verbale" value={gruppo.label} onChange={e => updateGruppo(gi, 'label', e.target.value)} style={{ marginTop: 3 }} />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Chiave</label>
                  <input className="form-input" value={gruppo.key} onChange={e => updateGruppo(gi, 'key', e.target.value)} style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 12 }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                {gruppo.campi.map((c, ci) => (
                  <div key={ci} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 6, alignItems: 'flex-end' }}>
                    <div>
                      {ci === 0 && <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Etichetta</label>}
                      <input className="form-input" placeholder="es. Vocabolario" value={c.label} onChange={e => updateCampoGruppo(gi, ci, 'label', e.target.value)} style={{ marginTop: ci === 0 ? 3 : 0 }} />
                    </div>
                    <div>
                      {ci === 0 && <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Chiave</label>}
                      <input className="form-input" placeholder="slug" value={c.key} onChange={e => updateCampoGruppo(gi, ci, 'key', e.target.value)} style={{ marginTop: ci === 0 ? 3 : 0, fontFamily: 'monospace', fontSize: 12 }} />
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
            </div>
          </details>
        ))}
        <button type="button" onClick={addGruppo} style={{ marginTop: 4, fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px dashed var(--accent)', borderRadius: 'var(--radius)', padding: '5px 12px', cursor: 'pointer', width: '100%' }}>
          + Aggiungi gruppo secondario
        </button>
      </div>

      {/* Opzioni */}
      <div className="form-group" style={{ marginBottom: 14 }}>
        <label className="form-label">Nota range <span>(facoltativo)</span></label>
        <input
          className="form-input"
          placeholder="Testo della nota metodologica sui range (es. 'Il range medio corrisponde a…')"
          value={form.notaRange}
          onChange={e => setField('notaRange', e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.richiedeEtaValutazione} onChange={e => setField('richiedeEtaValutazione', e.target.checked)} />
          Richiede età al momento della valutazione
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.richiedeStrumentiUtilizzati} onChange={e => setField('richiedeStrumentiUtilizzati', e.target.checked)} />
          Richiede strumenti utilizzati
        </label>
      </div>

      {/* Anteprima */}
      <button type="button" onClick={() => setShowPreview(v => !v)} style={{
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
function TemplateCard({ template, onDisattiva, onDelete, onEdit, onRiattiva }: { template: TestTemplate, onDisattiva?: () => void, onDelete?: () => void, onEdit?: () => void, onRiattiva?: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      border: `1px solid ${template.builtIn ? 'var(--accent)' : 'var(--border-md)'}`,
      borderRadius: 'var(--radius)', padding: '14px 16px',
      background: template.builtIn ? 'var(--accent-lt)' : 'var(--bg-panel)',
      opacity: template.attivo ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" onClick={() => setOpen(v => !v)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {open ? 'Chiudi' : 'Dettagli'}
          </button>
          {onEdit && (
            <button type="button" onClick={onEdit} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Pencil size={13} /> Modifica
            </button>
          )}
          {onRiattiva && (
            <button type="button" onClick={onRiattiva} style={{ background: 'none', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Riattiva
            </button>
          )}
          {template.attivo && onDisattiva && (
            <button type="button" onClick={onDisattiva} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Disattiva
            </button>
          )}
          {!template.builtIn && onDelete && (
            <button type="button" onClick={onDelete} style={{ background: 'none', border: '1px solid var(--danger)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={13} /> Elimina
            </button>
          )}
        </div>
      </div>

      {open && (
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
        </div>
      )}
    </div>
  )
}

// ── Pagina principale ─────────────────────────────────────────
export default function GestioneTest() {
  const [templates, setTemplates] = useState<TestTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formInitial, setFormInitial] = useState<FormState | undefined>(undefined)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [confirmDisattiva, setConfirmDisattiva] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [profilo, setProfilo] = useState<ProfiloProfessionista | null>(null)
  const [successo, setSuccesso] = useState('')
  
  // Stati per suggerimenti AI
  const [suggerimenti, setSuggerimenti] = useState<string[]>([])
  const [loadingSuggerimenti, setLoadingSuggerimenti] = useState(false)

  // Stati per suggerimenti da Profilo di Stile
  const [suggerimentiProfilo, setSuggerimentiProfilo] = useState<any[]>([])
  const [loadingProfilo, setLoadingProfilo] = useState(false)
  const [erroreProfilo, setErroreProfilo] = useState('')
  const [loadingEstraiTest, setLoadingEstraiTest] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getTestTemplates(),
      getProfiloProfessionista()
    ]).then(([t, prof]) => {
      setTemplates(t)
      setProfilo(prof)
      setLoading(false)
    })
  }, [])

  async function handleSuggerisci() {
    setLoadingSuggerimenti(true)
    try {
      const relazioni = await getRelazioni()
      if (relazioni.length === 0) {
        setSuccesso('Nessuna relazione in archivio da analizzare.')
        setTimeout(() => setSuccesso(''), 4000)
        return
      }
      const nomiEsistenti = templates.map(t => t.nome)
      const res = await suggerisciTestDaArchivio(relazioni, nomiEsistenti)
      if (res.length === 0) {
        setSuccesso('Nessun nuovo test rilevato dalle tue relazioni.')
        setTimeout(() => setSuccesso(''), 4000)
      } else {
        setSuggerimenti(res)
      }
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoadingSuggerimenti(false)
    }
  }

  function precompilaDaSuggerimento(nome: string) {
    setFormInitial({ ...INIT_FORM, nome })
    setShowForm(true)
    setSuggerimenti(s => s.filter(x => x !== nome))
  }

  async function handleEstraiDaProfilo() {
    setLoadingProfilo(true)
    setErroreProfilo('')
    try {
      const profiloStile = await getProfiloStile()
      if (!profiloStile || !profiloStile.trim()) {
        setErroreProfilo('Nessun Profilo di Stile trovato. Generalo prima nella pagina "Il mio stile".')
        setTimeout(() => setErroreProfilo(''), 5000)
        return
      }
      const nomiEsistenti = templates.map(t => t.nome)
      const res = await rilevaNomiTestDaProfilo(profiloStile, nomiEsistenti)
      if (res.length === 0) {
        setSuccesso('Nessun nuovo test template rilevato nel tuo Profilo di Stile.')
        setTimeout(() => setSuccesso(''), 4000)
      } else {
        setSuggerimentiProfilo(res)
      }
    } catch (e: any) {
      console.error(e)
      setErroreProfilo('Errore durante l\'estrazione: ' + e.message)
      setTimeout(() => setErroreProfilo(''), 5000)
    } finally {
      setLoadingProfilo(false)
    }
  }

  async function precompilaDaProfilo(nome: string) {
    setLoadingEstraiTest(nome)
    setErroreProfilo('')
    try {
      const profiloStile = await getProfiloStile()
      if (!profiloStile || !profiloStile.trim()) {
        setErroreProfilo('Nessun Profilo di Stile trovato.')
        return
      }
      const t = await generaTemplateTest(nome, profiloStile)
      if (!t) {
        setErroreProfilo(`Impossibile generare il template dettagliato per il test "${nome}".`)
        return
      }
      setFormInitial({
        nome: t.nome || nome,
        categoria: t.categoria || 'altro',
        scalaDefault: t.scalaDefault || { tipo: 'scalare' },
        campiPrincipali: (t.campiPrincipali || []).map((c: any) => ({ key: c.key, label: c.label, descr: c.descr || '' })),
        gruppiSecondari: (t.gruppiSecondari || []).map((g: any) => ({ key: g.key, label: g.label, campi: (g.campi || []).map((c: any) => ({ key: c.key, label: c.label })) })),
        notaRange: t.notaRange || '',
        richiedeEtaValutazione: t.richiedeEtaValutazione ?? false,
        richiedeStrumentiUtilizzati: t.richiedeStrumentiUtilizzati ?? false,
      })
      setShowForm(true)
      setSuggerimentiProfilo(s => s.filter(x => x.nome !== nome))
    } catch (e: any) {
      console.error(e)
      setErroreProfilo('Errore durante la generazione del template: ' + e.message)
    } finally {
      setLoadingEstraiTest(null)
    }
  }

  async function handleSave(form: FormState) {
    if (editingTemplateId) {
      // Modalità modifica
      await updateTestTemplate(editingTemplateId, {
        nome: sanitizzaStringa(form.nome),
        categoria: form.categoria,
        scalaDefault: form.scalaDefault,
        campiPrincipali: form.campiPrincipali as CampoTest[],
        gruppiSecondari: form.gruppiSecondari.length > 0 ? form.gruppiSecondari as GruppoTest[] : undefined,
        notaRange: form.notaRange || undefined,
        richiedeEtaValutazione: form.richiedeEtaValutazione,
        richiedeStrumentiUtilizzati: form.richiedeStrumentiUtilizzati,
      })
      const updated = await getTestTemplates()
      setTemplates(updated)
      setShowForm(false)
      setEditingTemplateId(null)
      setFormInitial(undefined)
      setSuccesso(`Template "${sanitizzaStringa(form.nome)}" aggiornato con successo.`)
      setTimeout(() => setSuccesso(''), 4000)
      return
    }
    // Modalità creazione
    const nuovoTemplate = await insertTestTemplate({
      nome: sanitizzaStringa(form.nome),
      categoria: form.categoria,
      scalaDefault: form.scalaDefault,
      campiPrincipali: form.campiPrincipali as CampoTest[],
      gruppiSecondari: form.gruppiSecondari.length > 0 ? form.gruppiSecondari as GruppoTest[] : undefined,
      notaRange: form.notaRange || undefined,
      richiedeEtaValutazione: form.richiedeEtaValutazione,
      richiedeStrumentiUtilizzati: form.richiedeStrumentiUtilizzati,
      attivo: true,
      schemaVersion: 1,
    })
    const updated = await getTestTemplates()
    setTemplates(updated)
    setShowForm(false)
    setSuccesso(`Template "${nuovoTemplate.nome}" aggiunto con successo.`)
    setTimeout(() => setSuccesso(''), 4000)
  }

  async function handleDisattiva(id: string) {
    await disattivaTestTemplate(id)
    const updated = await getTestTemplates()
    setTemplates(updated)
    setConfirmDisattiva(null)
    setSuccesso('Template disattivato. Non comparirà più nel wizard.')
    setTimeout(() => setSuccesso(''), 4000)
  }

  async function handleRiattiva(id: string) {
    await updateTestTemplate(id, { attivo: true })
    const updated = await getTestTemplates()
    setTemplates(updated)
    setSuccesso('Template riattivato. Comparirà di nuovo nel wizard.')
    setTimeout(() => setSuccesso(''), 4000)
  }

  async function handleDelete(id: string) {
    await deleteTestTemplate(id)
    const updated = await getTestTemplates()
    setTemplates(updated)
    setConfirmDelete(null)
    setSuccesso('Template eliminato definitivamente.')
    setTimeout(() => setSuccesso(''), 4000)
  }

  const attivi = templates.filter(t => t.attivo)
  const disattivati = templates.filter(t => !t.attivo)

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Gestione Test</div>
          <div className="topbar-sub">Template per test neuropsicologici strutturati</div>
        </div>
      </div>

      <div className="page-body">
        {USE_MOCK && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <FlaskConical size={15} style={{ flexShrink: 0 }} />
            <span>Modalità demo — i template creati qui sono salvati solo in memoria e si azzerano al refresh.</span>
          </div>
        )}

        {successo && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 'var(--radius)', color: '#065f46', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={14} /> {successo}
          </div>
        )}

        {/* Info */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--accent-dk)' }}>
            Template configurabili
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            I template <strong>predefiniti</strong> (WISC-IV, NEPSY-II) non possono essere eliminati né rinominati, ma possono essere disattivati se non utilizzati.
            I template <strong>personalizzati</strong> creati qui compariono nel wizard e generano tabelle e narrative automatiche nella relazione.
            La qualità narrativa dipende dalla completezza delle frasi descrittive inserite per ciascun campo.
          </p>
        </div>

        {/* Lista template attivi */}
        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '32px 0' }}>
            <span className="spinner" style={{ width: 22, height: 22, margin: '0 auto 8px', display: 'block' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Caricamento template…</p>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600, color: 'var(--accent-dk)', margin: 0 }}>
                Template attivi ({attivi.length})
              </h3>
              {!showForm && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleEstraiDaProfilo} disabled={loadingProfilo} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {loadingProfilo ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Sparkles size={14} color="var(--accent)" />}
                    {loadingProfilo ? 'Estrazione...' : 'Estrai da Profilo'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={handleSuggerisci} disabled={loadingSuggerimenti} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {loadingSuggerimenti ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Sparkles size={14} color="var(--accent)" />}
                    {loadingSuggerimenti ? 'Analisi...' : 'Suggerisci dall\'archivio'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => { setFormInitial(undefined); setShowForm(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={14} /> Nuovo template
                  </button>
                </div>
              )}
            </div>

            {erroreProfilo && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--danger-lt, #fee2e2)', border: '1px solid #f5c6c2', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} /> {erroreProfilo}
              </div>
            )}

            {suggerimentiProfilo.length > 0 && !showForm && (
              <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--accent-lt)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-dk)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} /> Template rilevati nel tuo Profilo di Stile (clicca per creare)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {suggerimentiProfilo.map(t => {
                    const isExtracting = loadingEstraiTest === t.nome
                    return (
                      <button key={t.nome} type="button" onClick={() => precompilaDaProfilo(t.nome)} disabled={!!loadingEstraiTest} style={{
                        background: 'var(--bg-panel)', border: '1px solid var(--accent)', borderRadius: 10,
                        padding: '8px 14px', fontSize: 12, color: 'var(--text)', cursor: isExtracting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        textAlign: 'left', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'all 0.15s',
                        opacity: loadingEstraiTest && !isExtracting ? 0.6 : 1
                      }}>
                        {isExtracting ? (
                          <span className="spinner" style={{ width: 14, height: 14, flexShrink: 0 }} />
                        ) : (
                          <Plus size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--accent-dk)' }}>{t.nome}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                            {t.categoria} · Clicca per estrarre struttura
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {suggerimenti.length > 0 && !showForm && (
              <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--accent-lt)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-dk)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} /> Test rilevati nelle tue relazioni (bozze)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {suggerimenti.map(s => (
                    <button key={s} type="button" onClick={() => precompilaDaSuggerimento(s)} style={{
                      background: 'var(--bg-panel)', border: '1px solid var(--accent)', borderRadius: 14,
                      padding: '4px 10px', fontSize: 12, color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                    }}>
                      <Plus size={12} color="var(--accent)" /> {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Form creazione / modifica */}
            {showForm && (
              <div style={{ border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: '18px 16px', marginBottom: 16, background: 'var(--accent-lt)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-dk)', marginBottom: 14 }}>
                  {editingTemplateId ? `Modifica template` : 'Nuovo template di test'}
                </div>
                <FormTemplate
                  initial={formInitial}
                  onSave={handleSave}
                  onCancel={() => { setShowForm(false); setEditingTemplateId(null); setFormInitial(undefined) }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {attivi.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onEdit={() => {
                    const f: FormState = {
                      nome: t.nome,
                      categoria: t.categoria,
                      scalaDefault: t.scalaDefault,
                      campiPrincipali: (t.campiPrincipali || []).map(c => ({ key: c.key, label: c.label, descr: c.descr || '' })),
                      gruppiSecondari: (t.gruppiSecondari || []).map(g => ({ key: g.key, label: g.label, campi: (g.campi || []).map(c => ({ key: c.key, label: c.label })) })),
                      notaRange: t.notaRange || '',
                      richiedeEtaValutazione: t.richiedeEtaValutazione,
                      richiedeStrumentiUtilizzati: t.richiedeStrumentiUtilizzati,
                    }
                    setEditingTemplateId(t.id)
                    setFormInitial(f)
                    setShowForm(true)
                  }}
                  onDisattiva={() => setConfirmDisattiva(t.id)}
                  onDelete={!t.builtIn ? () => setConfirmDelete(t.id) : undefined}
                />
              ))}
              {attivi.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  Nessun template attivo.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Template disattivati */}
        {disattivati.length > 0 && (
          <div className="card">
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
              Template disattivati ({disattivati.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {disattivati.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onRiattiva={() => handleRiattiva(t.id)}
                  onDelete={!t.builtIn ? () => setConfirmDelete(t.id) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Confirm dialog disattivazione */}
        {confirmDisattiva && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--bg-panel)', borderRadius: 12, padding: '28px 32px', maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <AlertTriangle size={20} color="var(--danger)" />
                <span style={{ fontSize: 15, fontWeight: 600 }}>Disattiva template</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
                Il template verrà disattivato e non apparirà più nel wizard per le nuove relazioni.
                Le relazioni già generate non vengono modificate.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDisattiva(confirmDisattiva)}>
                  Disattiva
                </button>
                <button className="btn btn-secondary" onClick={() => setConfirmDisattiva(null)}>Annulla</button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm dialog eliminazione */}
        {confirmDelete && (() => {
          const genere = String(profilo?.genere || '').trim().toLowerCase();
          const sicuroMsg = genere === 'uomo'
            ? 'Sei sicuro di voler eliminare questo template?'
            : (genere === 'donna' ? 'Sei sicura di voler eliminare questo template?' : 'Sei sicurə di voler eliminare questo template?');
          
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ background: 'var(--bg-panel)', borderRadius: 12, padding: '28px 32px', maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <AlertTriangle size={20} color="var(--danger)" />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Elimina template</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
                  {sicuroMsg} Questa azione è irreversibile e rimuoverà definitivamente il template dal database.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDelete(confirmDelete)}>
                    Elimina
                  </button>
                  <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Annulla</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  )
}
