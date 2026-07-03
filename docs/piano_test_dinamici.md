# Piano implementativo — Test neuropsicologici dinamici (template configurabili)

**Progetto**: PsicoRelazioni
**Documento**: piano tecnico per una singola feature, da eseguire in un ambiente di sviluppo locale con accesso al repo
**Stato**: proposta, non ancora implementata
**Riferimento**: continua `piano_implementazione_relazioni_v2_0.md` (§0), ma è tenuto separato perché è un piano prospettico per un lavoro non ancora iniziato, non un changelog di cose già fatte

---

## 1. Problema da risolvere

Oggi WISC-IV e NEPSY-II sono **hardcoded**: ogni test strutturato tocca 7 punti indipendenti del codice, alcuni dei quali duplicano la stessa logica in due linguaggi diversi (Markdown e OOXML via `docx`). Aggiungere un test nuovo (BVN 5-11, TEMA-3, batterie diverse man mano che il corpus del Profilo di Stile cresce) significa oggi riscrivere quei 7 punti da zero per ogni test:

| # | File | Cosa fa oggi, specifico per WISC/NEPSY |
|---|---|---|
| 1 | `src/components/constants/testDefinitions.ts` | Definisce `WISC_IV_CAMPI`, `WISC_IV_SUBTEST_PER_INDICE`, `NEPSY_II_DOMINI` come costanti scritte a mano, più `fasciaWISC()`/`fasciaScalare()` |
| 2 | `src/components/pages/WizardNuovaRelazione.tsx` | `StepCognitivo`/`StepNepsy` sono componenti scritti a mano; `SEZIONI_DISPONIBILI` ha `cognitivo`/`nepsy` come voci fisse con label che cita "WISC-IV"/"NEPSY-II" letteralmente |
| 3 | `src/services/wizardToText.ts` | `wiscToMarkdownTable()`/`nepsyToMarkdownTable()`, `wiscToNarrativa()`/`nepsyToNarrativa()`, `wiscSubtestPpToNarrativa()` — builder dedicati |
| 4 | `src/services/geminiService.ts` | Due blocchi `userData.push(...)` dedicati (uno per `cognitivo`, uno per `nepsy`) dentro `generaNarrativaSezioni()`, più istruzioni scritte apposta nel system prompt |
| 5 | `src/services/exportDocx.ts` | `makeWiscTable()`/`makeNepsyTable()` — **duplicano** la stessa selezione righe + calcolo fascia già fatta al punto 3, ma per costruire una `Table` di `docx` invece di una stringa Markdown |
| 6 | `src/services/profileAlignment.ts` | `estraiRequisitiDaProfilo()` fa pattern-matching regex hardcoded solo su pattern WISC (`richiedeRiferimentiSubtest`, `richiedeNoteRangeWisc`, ecc.) |
| 7 | `validateStep()` in `WizardNuovaRelazione.tsx` | Due `case` scritti a mano, uno per `cognitivo` uno per `nepsy` |

Il punto 3↔5 (duplicazione Markdown/Word) è la stessa causa alla radice del bug delle tabelle duplicate già risolto (nona correzione, §0 del piano principale) — mantenere due implementazioni parallele della stessa tabella è già stato un problema una volta.

**Obiettivo**: passare da "N test = N implementazioni bespoke" a "N test = N righe di dati", con un motore generico che genera tutti e 7 i punti da un'unica descrizione dichiarativa del test.

---

## 2. Principio architetturale

Un singolo tipo dati, `TestTemplate`, descrive tutto ciò che serve a sapere di un test per generare automaticamente form, tabella, narrativa, payload Gemini e validazione. WISC-IV e NEPSY-II smettono di essere codice e diventano **dati** (seed `builtIn`), esattamente con la stessa struttura che userebbe un test creato dall'utente.

Le sei funzioni bespoke elencate sopra vengono sostituite da **sei funzioni generiche**, parametrizzate su `TestTemplate`. Il punto più delicato è il 3↔5: invece di due implementazioni indipendenti (Markdown + Word) che duplicano la selezione-righe e il calcolo-fascia, si introduce un **livello intermedio condiviso** — una funzione che produce righe di dati pure (`{ label, valore, fascia, interpretabile }[]`), da cui *due renderer sottili* (uno Markdown, uno Word) derivano l'output. Questo elimina strutturalmente la classe di bug della nona correzione, non solo per WISC/NEPSY ma per ogni test futuro.

---

## 3. Modello dati

### 3.1 Schemi di Validazione Zod e Tipi TypeScript

Per prevenire lo schema drift dovuto all'uso di colonne JSONB e garantire la compatibilità in avanti, utilizziamo **Zod** per validare i dati ai confini dell'applicazione (lettura/scrittura su database) ed estraiamo i tipi TypeScript direttamente dagli schemi Zod tramite `z.infer`. Inoltre, includiamo un campo `schemaVersion` per gestire le evoluzioni future del formato.

Nuovo file: `src/core/testTemplate.ts`

```typescript
import { z } from 'zod';

export const TipoScalaSchema = z.enum([
  'qi_wisc',        // media 100, DS 15 — riusa fasciaWISC() esistente
  'scalare',        // media 10, DS 3 — riusa fasciaScalare() esistente
  'soglie_custom'   // scala propria del test (percentili, z-score, cut-off clinici...)
]);

export const SogliaCustomSchema = z.object({
  min: z.number(),                // inclusivo
  max: z.number().nullable(),     // inclusivo, null = nessun limite superiore (infinito)
  etichetta: z.string(),          // es. "Deficitario", "Adeguato"
});

export const ScalaPunteggioSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('qi_wisc') }),
  z.object({ tipo: z.literal('scalare') }),
  z.object({ 
    tipo: z.literal('soglie_custom'), 
    soglie: z.array(SogliaCustomSchema) 
  }),
]);

export const CampoTestSchema = z.object({
  key: z.string(),                // slug univoco nel template, es. 'icv', 'attenzione_uditiva'
  label: z.string(),              // es. "Comprensione Verbale (ICV)"
  descr: z.string().optional(),   // frase-cornice descrittiva, usata nella narrativa (facoltativa)
  scala: ScalaPunteggioSchema.optional(), // eredita da GruppoTest o TestTemplate se assente
});

export const GruppoTestSchema = z.object({
  key: z.string(),                // es. 'icv'
  label: z.string(),              // es. "Comprensione Verbale (ICV)" — intestazione accordion
  scalaDefault: ScalaPunteggioSchema.optional(),
  campi: z.array(CampoTestSchema), // subtest del gruppo (narrativa, mai tabella)
});

export const TestTemplateSchema = z.object({
  id: z.string(),                 // slug stabile: 'wisc-iv', 'nepsy-ii', o UUID per i custom
  nome: z.string(),               // "WISC-IV", visualizzato ovunque
  categoria: z.enum(['cognitivo', 'nepsy', 'apprendimenti', 'questionari', 'altro']),
  scalaDefault: ScalaPunteggioSchema,
  campiPrincipali: z.array(CampoTestSchema),
  gruppiSecondari: z.array(GruppoTestSchema).optional(),
  notaRange: z.string().optional(),
  richiedeEtaValutazione: z.boolean().default(false),
  richiedeStrumentiUtilizzati: z.boolean().default(false),
  builtIn: z.boolean().default(false),
  attivo: z.boolean().default(true),
  schemaVersion: z.number().default(1), // Gestione compatibilità schemi futuri
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Estrazione tipi TypeScript dagli schemi Zod
export type TipoScala = z.infer<typeof TipoScalaSchema>;
export type SogliaCustom = z.infer<typeof SogliaCustomSchema>;
export type ScalaPunteggio = z.infer<typeof ScalaPunteggioSchema>;
export type CampoTest = z.infer<typeof CampoTestSchema>;
export type GruppoTest = z.infer<typeof GruppoTestSchema>;
export type TestTemplate = z.infer<typeof TestTemplateSchema>;
```

**Nota sul builtIn = true**: WISC-IV e NEPSY-II restano *concettualmente* speciali (sono gli unici due che compaiono nel Profilo di Stile originale con frasi-cornice osservate direttamente su relazioni reali, vedi §0 "Struttura reale identificata" nel piano principale). `builtIn` non cambia il motore di rendering — serve solo a impedire che vengano cancellati/rinominati per errore dalla pagina di gestione (§7).

### 3.2 Risultato di un test compilato nel wizard

Sostituisce le chiavi fisse `wizard.cognitivo` / `wizard.nepsy` con una mappa generica:

```typescript
export type RisultatoTest = {
  somministrato?: boolean
  punteggi: Record<string, string | number>              // chiave = CampoTest.key dei campiPrincipali
  punteggiSecondari?: Record<string, string | number>       // chiave = CampoTest.key dentro i gruppiSecondari (sostituisce cognitivo.subtest_pp)
  interpretabilita?: Record<string, boolean>                  // solo per campiPrincipali, default true se assente
  includiNotaRange?: boolean
  etaValutazione?: string
  strumentiUtilizzati?: string
  noteCliniche?: string
}

// In WizardData (core/types.ts):
export type WizardData = UnknownRecord & {
  sezioni_attive?: string[]      // ora contiene ID di TestTemplate per le sezioni test-based, invariato per anamnesi/osservazione/apprendimenti/questionari/conclusioni
  test_risultati?: Record<string, RisultatoTest>   // chiave = TestTemplate.id
  // ... resto invariato (anagrafica, contesto, ecc.)
}
```

### 3.3 Schema Supabase

Nuova tabella `test_templates`. **Da verificare contro lo schema reale esistente** (`supabase_setup.sql` nel repo ricevuto risulta vuoto/non allineato al DB effettivo — prima di applicare questa migrazione, esportare lo schema corrente da Supabase Studio e verificare il pattern di RLS realmente in uso su `relazioni`/`pazienti`, per restare coerenti).

```sql
create table if not exists test_templates (
  id                 text primary key,
  nome               text not null,
  categoria          text not null check (categoria in ('cognitivo','nepsy','apprendimenti','questionari','altro')),
  scala_default      jsonb not null,
  campi_principali   jsonb not null,        -- CampoTest[]
  gruppi_secondari   jsonb,                   -- GruppoTest[] | null
  nota_range         text,
  richiede_eta_valutazione     boolean not null default false,
  richiede_strumenti_utilizzati boolean not null default false,
  built_in           boolean not null default false,
  attivo             boolean not null default true,
  schema_version     integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table test_templates enable row level security;

-- ALLINEARE alla policy reale già in uso sulle altre tabelle (auth.uid()
-- semplice se l'app resta mono-utente, oppure owner_id se multi-tenant)
create policy "solo utenti autenticati" on test_templates
  for all using (auth.uid() is not null);
```

Seed iniziale (migrazione dati, non schema): inserire `wisc-iv` e `nepsy-ii` come righe con `built_in = true`, serializzando esattamente `WISC_IV_CAMPI` + `WISC_IV_SUBTEST_PER_INDICE` + `WISC_IV_INDICE_LABEL` e `NEPSY_II_DOMINI` nel nuovo formato `TestTemplate`. Questo è meccanico ma va fatto con attenzione: è il passo che garantisce che l'output non cambi per i due test esistenti (vedi Fase 2, criterio di accettazione "diff zero").

### 3.4 Layer di accesso dati

Nuovo file `src/data/testTemplatesData.ts`, formato di validazione basato su Zod, integrato con branch `USE_MOCK` / Supabase, nessun ORM:

```typescript
import { TestTemplateSchema, type TestTemplate } from '../core/testTemplate';

export async function getTestTemplates(): Promise<TestTemplate[]>
export async function getTestTemplatesAttivi(): Promise<TestTemplate[]>
export async function insertTestTemplate(t: Omit<TestTemplate,'id'|'createdAt'|'updatedAt'|'builtIn'>): Promise<TestTemplate>
export async function updateTestTemplate(id: string, patch: Partial<TestTemplate>): Promise<void>
export async function disattivaTestTemplate(id: string): Promise<void>   // soft-delete, mai una DELETE reale
```

`MOCK_TEST_TEMPLATES` in `src/data/mockData.ts` conterrà i seed WISC-IV/NEPSY-II per la modalità demo, stesso schema del seed Supabase di §3.3.

---

## 4. Migrazione di `wizard_snapshot` e retrocompatibilità

Le relazioni/bozze già salvate hanno `wizard_snapshot.cognitivo` / `.nepsy` nel vecchio formato (incluso `cognitivo.subtest_pp` introdotto di recente). Non è praticabile né necessaria una migrazione batch sul DB: si segue lo stesso approccio già usato per `riferimenti_subtest → subtest_pp` — **normalizzazione in lettura, mai in scrittura silenziosa**.

In `WizardNuovaRelazione.tsx`, nella funzione di HYDRATE, aggiungere una funzione `migraWizardSnapshotLegacy(raw)`:

```typescript
function migraWizardSnapshotLegacy(raw: UnknownRecord): UnknownRecord {
  if (raw.test_risultati) return raw   // già nel formato nuovo, non toccare

  const test_risultati: Record<string, RisultatoTest> = {}

  if (raw.cognitivo) {
    test_risultati['wisc-iv'] = {
      somministrato: raw.cognitivo.somministrato,
      punteggi: raw.cognitivo.punteggi || {},
      punteggiSecondari: raw.cognitivo.subtest_pp || {},
      interpretabilita: raw.cognitivo.interpretabilita || {},
      includiNotaRange: raw.cognitivo.includi_nota_range,
      etaValutazione: raw.cognitivo.eta_valutazione,
      strumentiUtilizzati: raw.cognitivo.strumenti_utilizzati,
      noteCliniche: raw.cognitivo.note_cliniche,
    }
  }
  if (raw.nepsy) {
    test_risultati['nepsy-ii'] = {
      somministrato: raw.nepsy.somministrato,
      punteggi: raw.nepsy.punteggi || {},
      includiNotaRange: raw.nepsy.includi_nota_range,
      strumentiUtilizzati: raw.nepsy.strumenti_utilizzati,
      noteCliniche: raw.nepsy.note_cliniche,
    }
  }

  // sezioni_attive: 'cognitivo'/'nepsy' restano ID validi 1:1 con
  // wisc-iv/nepsy-ii SOLO se si sceglie 'wisc-iv'/'nepsy-ii' come id
  // dei template builtIn (vedi §3.3) — altrimenti va rimappato qui.

  return { ...raw, test_risultati, cognitivo: undefined, nepsy: undefined }
}
```

**Punto critico**: scegliere `id: 'wisc-iv'` e `id: 'nepsy-ii'` per i template builtIn (non UUID) rende `sezioni_attive` retrocompatibile gratis, perché i valori `'cognitivo'`/`'nepsy'` in `SEZIONI_DISPONIBILI` andranno comunque rimappati a questi due ID — decidere la convenzione ID prima di scrivere la migrazione, non durante.

`assemblaDocumentoMarkdown()` e `generaNarrativaSezioni()` leggono `wizard.test_risultati`; non hanno più bisogno di sapere nulla di "cognitivo"/"nepsy" come concetti — solo di iterare `sezioni_attive` cercando, per ciascun ID, o un `TestTemplate` (via `getTestTemplateById`) o una sezione non-test nota (`anamnesi`, `apprendimenti`, ecc., che restano codice bespoke come oggi — vedi §8).

---

## 5. Le sei funzioni generiche

Nuovo file `src/services/testTemplateEngine.ts`. Ognuna sostituisce una coppia di funzioni bespoke esistenti.

### 5.1 `calcolaFascia(valore, scala: ScalaPunteggio): string`

Dispatch su `scala.tipo`:
- `'qi_wisc'` → riusa **esattamente** `fasciaWISC()` da `testDefinitions.ts` (non riscriverla, solo richiamarla)
- `'scalare'` → riusa **esattamente** `fasciaScalare()`
- `'soglie_custom'` → itera `scala.soglie`, ritorna la prima il cui `[min, max]` contiene il valore (vedi sotto per la validazione algoritmica di contiguità).

### 5.1b Algoritmo di Validazione `soglie_custom`

Per garantire che le soglie definite dall'utente in Gestione Test siano coerenti e prive di falle interpretative, implementiamo un algoritmo di validazione rigoroso:

```typescript
export function validaSoglieCustom(soglie: SogliaCustom[]): { valida: boolean; errore?: string } {
  if (soglie.length === 0) {
    return { valida: false, errore: 'Almeno una soglia deve essere definita.' };
  }

  // Ordina per valore minimo
  const ordinate = [...soglie].sort((a, b) => a.min - b.min);

  for (let i = 0; i < ordinate.length; i++) {
    const cur = ordinate[i];

    // Non ammettiamo max === null per elementi intermedi (lascerebbe un buco)
    if (i < ordinate.length - 1 && cur.max === null) {
      return { valida: false, errore: `La soglia "${cur.etichetta}" non può avere limite superiore indefinito se non è l'ultima.` };
    }

    // Se è l'ultima, può essere null per coprire fino a infinito. Se non lo è, controlliamo la contiguità.
    if (i < ordinate.length - 1) {
      const next = ordinate[i + 1];
      if (cur.max !== next.min) {
        return { 
          valida: false, 
          errore: `Intervallo non contiguo tra "${cur.etichetta}" (max: ${cur.max}) e "${next.etichetta}" (min: ${next.min}).` 
        };
      }
    }
  }

  return { valida: true };
}
```

### 5.2 `calcolaRigheTabella(template, risultato): RigaTabella[]`

**Il pezzo architetturalmente più importante.** Sostituisce la logica duplicata di `wiscToMarkdownTable`+`makeWiscTable` (e l'equivalente NEPSY) con un'unica computazione:

```typescript
type RigaTabella = { label: string; valore: string | number; fascia: string; interpretabile: boolean }

function calcolaRigheTabella(template: TestTemplate, risultato: RisultatoTest): RigaTabella[] {
  return template.campiPrincipali
    .filter(c => risultato.punteggi[c.key] !== undefined && risultato.punteggi[c.key] !== '')
    .map(c => ({
      label: c.label,
      valore: risultato.punteggi[c.key],
      fascia: calcolaFascia(risultato.punteggi[c.key], c.scala || template.scalaDefault),
      interpretabile: risultato.interpretabilita?.[c.key] !== false,
    }))
}
```

Da qui, due renderer **sottili** (nessuna logica, solo formattazione):

```typescript
function righeToMarkdownTable(righe: RigaTabella[], nomeTest: string): string   // sostituisce wiscToMarkdownTable/nepsyToMarkdownTable
function righeToWordTable(righe: RigaTabella[], nomeTest: string): Table        // sostituisce makeWiscTable/makeNepsyTable in exportDocx.ts
```

`righeToWordTable` va spostata/esportata da `exportDocx.ts` (o importata lì) ma calcolata a partire dalle stesse `righe` usate per il Markdown — **mai più due filtri indipendenti sugli stessi dati**. Questo è il fix strutturale alla causa della nona correzione, generalizzato a ogni test futuro.

La colonna "Interpretabilità" resta condizionale (si mostra solo se almeno una riga ha `interpretabile === false`), stessa logica della tredicesima correzione, ora scritta una volta sola in `righeToMarkdownTable`/`righeToWordTable` invece che in due punti.

### 5.3 `calcolaNarrativaGruppi(template, risultato): string`

Generalizza `wiscSubtestPpToNarrativa()`. Itera `template.gruppiSecondari`, per ciascuno filtra i `campi` compilati in `risultato.punteggiSecondari`, produce una frase per gruppo. **Sempre narrativa, mai tabella** — questo vincolo (esplicitamente richiesto per i subtest WISC) diventa una proprietà strutturale del tipo `GruppoTest` stesso, non più una convenzione da ricordare in ogni nuovo builder.

```typescript
function calcolaNarrativaGruppi(template: TestTemplate, risultato: RisultatoTest): string {
  if (!template.gruppiSecondari?.length) return ''
  const frasi = template.gruppiSecondari
    .map(g => {
      const compilati = g.campi.filter(c => risultato.punteggiSecondari?.[c.key] !== undefined && risultato.punteggiSecondari[c.key] !== '')
      if (!compilati.length) return ''
      const dettagli = compilati
        .map(c => `${c.label} (pp ${risultato.punteggiSecondari![c.key]}, fascia ${calcolaFascia(risultato.punteggiSecondari![c.key], c.scala || g.scalaDefault || template.scalaDefault).toLowerCase()})`)
        .join(', ')
      return `Per ${g.label} sono stati considerati i seguenti subtest: ${dettagli}.`
    })
    .filter(Boolean)
  return frasi.join(' ')
}
```

### 5.4 `calcolaNarrativaBase(template, risultato): string`

Generalizza `wiscToNarrativa()`/`nepsyToNarrativa()`: per ogni campo principale compilato, usa `campo.descr` (se presente) + fascia calcolata; poi concatena `calcolaNarrativaGruppi()`. Se `campo.descr` è assente (probabile per template creati dall'utente senza descrizione clinica scritta a mano), usa un fallback generico: `"Il punteggio ottenuto al test ${campo.label} è ${valore}, fascia ${fascia}."` — meno elegante della prosa curata di WISC/NEPSY, ma mai vuoto. Questo è il punto in cui la qualità narrativa di un test custom sarà inferiore a WISC/NEPSY finché l'utente non compila `descr` per ciascun campo in Gestione Test (§7) — comunicarlo chiaramente in UI.

### 5.5 `buildGeminiPayload(template, risultato): string`

Sostituisce i due blocchi `userData.push(...)` in `geminiService.ts`. Genera lo stesso formato `=== SEZIONE: {id} ===` già usato, includendo tabella (già calcolata, marcata "non modificare"), nota range se prevista, narrativa gruppi secondari, età/strumenti se `template.richiedeEtaValutazione`/`richiedeStrumentiUtilizzati`, note cliniche anonimizzate. Il chiamante in `generaNarrativaSezioni()` diventa un loop:

```typescript
for (const templateId of sez.filter(isTestTemplateId)) {
  const template = templatesAttivi.find(t => t.id === templateId)
  const risultato = wizard.test_risultati?.[templateId]
  if (template && risultato?.punteggi && Object.keys(risultato.punteggi).length) {
    userData.push(buildGeminiPayload(template, risultato))
  }
}
```

Il **system prompt** resta in gran parte invariato (le istruzioni "non generare tabelle", "usa {{NOME}}", ecc. sono già generiche); va aggiornata solo l'istruzione specifica sui gruppi secondari, oggi scritta per "sezione cognitivo" nello specifico — va riformulata in modo generico ("per ogni sezione con sottogruppi di subtest, tessi i punti ponderati in prosa, mai in tabella").

### 5.6 `validaRisultatoTest(template, risultato): string[]`

Generalizza i due `case` in `validateStep()`: ritorna un array di messaggi mancanti. Per un template generico: `` `Almeno un punteggio ${template.nome} (o deseleziona la sezione)` `` se `Object.values(risultato.punteggi).every(v => !String(v ?? '').trim())`.

---

## 6. Wizard dinamico

### 6.1 `SEZIONI_DISPONIBILI`: da costante statica a derivata

Oggi è un array hardcoded di 7 voci. Diventa il merge di:
- le sezioni non-test, invariate: `anamnesi`, `osservazione`, `apprendimenti`, `questionari`, `conclusioni`
- i `TestTemplate` attivi, caricati via `getTestTemplatesAttivi()` all'apertura del wizard, ciascuno mappato a `{ id: template.id, label: template.nome, categoria: template.categoria, default: template.builtIn }`

Il `default: true` per WISC-IV/cognitivo va preservato per continuità d'uso (comportamento attuale), gli altri template partono deselezionati.

### 6.2 `buildSteps()`: uno `StepTestGenerico` al posto di `StepCognitivo`/`StepNepsy`

`StepTestGenerico` è l'evoluzione dell'accordion creato per WISC:

```tsx
function StepTestGenerico({ template, data, dispatch }: { template: TestTemplate; data: WizardData; dispatch: Dispatch }) {
  const risultato = data.test_risultati?.[template.id] || {}
  return (
    <div>
      <h3>{template.nome}</h3>
      {template.richiedeEtaValutazione && <CampoEtaValutazione .../>}
      {template.richiedeStrumentiUtilizzati && <CampoStrumentiUtilizzati .../>}
      {template.campiPrincipali.map(c => <InputPunteggio key={c.key} campo={c} .../>)}
      {template.gruppiSecondari?.map(g => <AccordionGruppo key={g.key} gruppo={g} .../>)}
      <CampoIncludiNotaRange visible={!!template.notaRange} .../>
      <CampoNoteCliniche .../>
    </div>
  )
}
```

`buildSteps()` sostituisce i due `if (sezioniAttive.includes('cognitivo'))`/`'nepsy'` con un loop sui template attivi in `sezioniAttive`.

### 6.3 `validateStep()`: dispatch generico

Il `switch` in `validateStep()` sostituisce i case `'cognitivo'`/`'nepsy'` con: se `stepId` corrisponde a un `TestTemplate.id`, chiama `validaRisultatoTest(template, data.test_risultati?.[stepId])`.

### 6.4 `profileAlignment.ts`: requisiti generici per template (non bloccante)

`estraiRequisitiDaProfilo()` va esteso (non sostituito) con un secondo livello: per ogni `TestTemplate` attivo, verificare se `template.nome` compare nel profilo con pattern indicanti subtest o note range, abilitando i corrispondenti requisiti.

**Criterio di Sicurezza**: Questa validazione per i test non built-in deve essere **esplicitamente non-bloccante e best-effort**. Eventuali discrepanze non devono mai impedire il salvataggio o la generazione della relazione, ma solo mostrare avvisi informativi discreti in UI.

---

## 7. Pagina "Gestione Test" (creazione manuale)

Nuova route `/gestione-test`, nuovo componente `src/components/pages/GestioneTest.tsx`. CRUD su `TestTemplate` via `testTemplatesData.ts`:
- Lista dei template esistenti (badge "predefinito" per i `builtIn`, non cancellabili/rinominabili — solo disattivabili)
- Form di creazione: nome, categoria, scala di default (selezione tra i 3 tipi; per `soglie_custom` un editor di righe min/max/etichetta con validazione algoritmica di contiguità)
- Campi principali: lista dinamica di `CampoTest` (chiave generata da slug del label, editabile)
- Gruppi secondari: opzionale, stessa UI a lista dinamica, con nota inline che ricorda "questi compariranno solo come testo narrativo, mai in tabella" (coerenza col vincolo di §5.3)
- Anteprima live: mostra come apparirebbe una riga di tabella e una frase di narrativa di esempio con valori fittizi, così l'utente vede l'effetto prima di salvare.

### 7.1 Sanitizzazione dei Campi
Tutte le stringhe inserite dall'utente per descrizioni, label dei test, label dei campi e note range vengono passate attraverso `rimuoviTabelleMarkdown()` o una sanitizzazione prima di essere concatenate nella narrativa della relazione. Questo previene formattazioni indesiderate dovute a incollaggi di testo contenenti intestazioni o markdown non valido.

---

## 8. Suggerimenti semi-automatici dal Profilo di Stile (fase successiva, opzionale)

Quando `analizzaStile`/`aggiornaProfiloIncrementale` (Modulo 2) processano il corpus, si può aggiungere — **come step separato e sempre proposto, mai applicato in automatico** — una chiamata a Gemini con prompt tipo: *"Nel testo fornito, elenca i nomi di test/batterie citati che non sono già in questa lista [id template esistenti]; per ciascuno, se riconoscibile dalla struttura del testo, suggerisci se ha punteggi per indice+subtest o un punteggio singolo"*. L'output è una lista di **proposte** mostrate in Gestione Test come bozze da rivedere/correggere/scartare — mai un `insertTestTemplate` automatico. Motivo: la scala di un test (soglie cliniche) è un dato troppo delicato per fidarsi di un parsing testuale senza revisione umana esplicita.

---

## 9. Cosa NON cambia

- **Apprendimenti e Questionari restano testo libero**, come da decisione di prodotto originale (§0 del piano principale, "le tabelle dei punteggi non vengono generate dal wizard" per gli strumenti eterogenei) — non hanno una struttura fissa nota come WISC/NEPSY, quindi non sono candidati a `TestTemplate`. Se in futuro emergesse un bisogno analogo (es. BVSCO ricorre sempre con la stessa struttura in più relazioni), si aggiungerebbe come categoria `'apprendimenti'` di `TestTemplate`.
- L'anagrafica reale resta esclusa dal payload Gemini, invariato.
- Il meccanismo `{{NOME}}` e l'anonimizzazione dei campi liberi (`note_cliniche`, ecc.) restano invariati — si applicano identici ai nuovi `RisultatoTest.noteCliniche`.

---

## 10. Piano di rollout a fasi

Ogni fase è verificabile in isolamento prima di passare alla successiva.

### Fase 1 — Fondamenta dati (nessun cambiamento visibile)
- Creare `src/core/testTemplate.ts` (tipi di §3.1-3.2)
- Creare tabella Supabase `test_templates` (§3.3)
- Creare `src/data/testTemplatesData.ts` + `MOCK_TEST_TEMPLATES` in `mockData.ts`
- Serializzare WISC-IV e NEPSY-II come seed `builtIn: true` — **criterio di accettazione**: i due JSON serializzati, ri-deserializzati e passati alle funzioni esistenti devono produrre output identico byte-per-byte a quello attuale.

### Fase 2 — Motore generico e Rete di Sicurezza (Vitest)
- Configurare **Vitest** come descritto nella sezione §11.
- Creare `src/services/testTemplateEngine.ts` (le 6 funzioni di §5).
- Scrivere i test di snapshot su WISC-IV e NEPSY-II.
- Sostituire, **uno alla volta**, le chiamate bespoke con le equivalenti generiche.
- **Criterio di accettazione — diff zero**: i test di snapshot devono passare senza alcuna differenza rispetto a prima.

### Fase 3 — Wizard dinamico
- `SEZIONI_DISPONIBILI` derivata da `getTestTemplatesAttivi()` (§6.1)
- `StepTestGenerico` sostituisce `StepCognitivo`/`StepNepsy` (§6.2)
- `validateStep()` generico (§6.3)
- Migrazione HYDRATE (`migraWizardSnapshotLegacy`, §4).

### Fase 4 — Gestione Test (creazione manuale)
- Pagina `/gestione-test` (§7).

### Fase 5 — Suggerimenti dal Profilo di Stile (opzionale, indipendente)
- Como da §8, quando le Fasi 1-4 sono stabili.

---

## 11. Rete di sicurezza automatizzata (Fase 2)

Per garantire la sicurezza del rollout ed evitare regressioni ("diff zero") durante la migrazione delle funzioni core bespoke (`wiscToMarkdownTable` etc.) a quelle generiche, si introduce una suite di unit test con **Vitest**.

Le funzioni da testare sono pure trasformazioni di dati e stringhe (nessuna interazione DOM), quindi non è necessario configurare `jsdom` o un ambiente browser: un ambiente Node semplice è sufficiente.

### 11.1 Configurazione minimale di Vitest

Installare la dipendenza di sviluppo:
```bash
npm install -D vitest
```

Aggiungere lo script di test a `package.json`:
```json
"test": "vitest run"
```

### 11.2 Snapshot Testing per gate a "Diff Zero"

Si crea un file di test `src/services/__tests__/testTemplateEngine.test.ts`. Questo file verifica che, dati gli stessi punteggi di input per WISC-IV e NEPSY-II, il nuovo motore generico produca lo stesso identico output (in righe della tabella, markdown ed export Gemini) rispetto alle vecchie funzioni.

Esempio di test:
```typescript
import { describe, it, expect } from 'vitest';
import { calcolaRigheTabella, righeToMarkdownTable, calcolaNarrativaBase, buildGeminiPayload } from '../testTemplateEngine';
import { MOCK_WISC_IV_TEMPLATE } from '../mockTemplates';

describe('Motore di Generazione Test - Diff Zero WISC-IV', () => {
  it('dovrebbe generare la stessa tabella e narrativa degli snapshot di riferimento', () => {
    const risposte = {
      punteggi: { icv: 110, rp: 95, iml: 100, ve: 105 },
      interpretabilita: { icv: true, rp: true, iml: true, ve: true },
      includiNotaRange: true,
      subtest_pp: { so: 10, vc: 12, co: 11 }
    };
    
    const righe = calcolaRigheTabella(MOCK_WISC_IV_TEMPLATE, risposte);
    const markdown = righeToMarkdownTable(righe, MOCK_WISC_IV_TEMPLATE.nome);
    const narrativa = calcolaNarrativaBase(MOCK_WISC_IV_TEMPLATE, risposte);
    const payload = buildGeminiPayload(MOCK_WISC_IV_TEMPLATE, risposte);
    
    expect(righe).toMatchSnapshot();
    expect(markdown).toMatchSnapshot();
    expect(narrativa).toMatchSnapshot();
    expect(payload).toMatchSnapshot();
  });
});
```

---

## 12. Rischi ed edge case da coprire nei test

- **Template con `gruppiSecondari` ma nessun `campiPrincipali` compilato**: la narrativa dei gruppi non deve comparire "orfana" senza la frase-cornice principale — decidere se in quel caso si mostra comunque o si nasconde.
- **`soglie_custom` con range che non copre un valore inserito**: `calcolaFascia` deve ritornare una stringa vuota o un fallback esplicito ("fascia non definita"), mai `undefined`/crash.
- **Template disattivato (`attivo: false`) ma presente in relazioni storiche**: `assemblaDocumentoMarkdown`/l'apertura da Archivio devono continuare a risolvere `test_risultati[id]` anche se il template non è più nella lista "attivi" — `getTestTemplateById` va usato nei percorsi di lettura.
- **Due template con lo stesso `nome` ma `id` diversi**: la UI di Gestione Test dovrebbe avvisare se il nome coincide con un `builtIn` esistente.
- **Ordine di visualizzazione**: i template custom aggiunti in corsa vanno inseriti in una posizione sensata (dopo nepsy, prima di apprendimenti) con un campo `ordine` esplicito su `TestTemplate`.

---

## 13. Checklist finale prima di considerare la feature completa

- [ ] Fase 1: seed WISC-IV/NEPSY-II verificati byte-per-byte contro il comportamento attuale.
- [ ] Fase 2: setup Vitest completato e test di snapshot funzionanti.
- [ ] Fase 2: diff zero su Markdown + DOCX generati in mock, prima/dopo la sostituzione del motore.
- [ ] Fase 3: 2-3 relazioni reali storiche riaperte correttamente dopo la migrazione HYDRATE.
- [ ] Fase 3: `StepTestGenerico` produce la stessa UX di `StepCognitivo`.
- [ ] Fase 4: un test completamente nuovo creato in Gestione Test, compilato, genera una relazione con tabella + narrativa coerente.
- [ ] Verificare che l'anonimizzazione (`anonimizzaTesto`) continui ad applicarsi a `RisultatoTest.noteCliniche` per ogni template.
- [ ] Verificare che `profileAlignment.ts` non generi blocchi al caricamento o al Wizard per i test personalizzati.
