---
name: psicorelazioni-dev
description: Guida allo sviluppo per PsicoRelazioni, web app React/TypeScript/Vite che assiste una neuropsicologa nella stesura di relazioni di valutazione neuropsicologica e dell'apprendimento (WISC-IV, NEPSY-II, DSA/ADHD) mantenendo il suo stile di scrittura, con Supabase e Google Gemini. Usa SEMPRE questa skill quando si lavora nel repo psicorelazioni o si toccano file come geminiService.ts, wizardToText.ts, anonimizza.ts, exportDocx.ts, testDefinitions.ts, o le pagine del wizard/archivio — per aggiungere funzionalità, modificare il wizard, cambiare i prompt Gemini, toccare lo schema Supabase, o correggere bug — anche se la richiesta non menziona esplicitamente "architettura" o "PsicoRelazioni". Le modifiche devono rispettare i pattern esistenti (separazione dati anagrafici/clinici, prompt chaining per i limiti di token, useReducer, convenzioni di naming) invece di romperli.
---

# PsicoRelazioni — guida allo sviluppo

## Cos'è il progetto

PWA che aiuta una neuropsicologa a scrivere relazioni di valutazione neuropsicologica e dell'apprendimento in età evolutiva (WISC-IV, NEPSY-II, CBCL/YSR, AC-MT, BVSCO — diagnosi DSA/ADHD ai sensi della L. 170/2010), mantenendo il suo stile di scrittura personale imparato dalle relazioni passate. Utente unica (la psicologa), sia da PC Windows che da smartphone.

Flusso core: import relazioni passate (DOCX/PDF) → analisi stile con AI → wizard guidato per il nuovo caso → generazione bozza nello stile appreso → editor di revisione → export DOCX → archivio consultabile.

## Stack tecnologico

- **Frontend**: React 19 + TypeScript + Vite 8, `react-router-dom` 7
- **Styling**: CSS puro con custom properties in `src/styles/index.css`/`App.css` (variabili come `--accent`, `--bg`, `--radius`). ⚠️ Il piano originale (`docs-ai/piano_implementazione_relazioni.md`) menziona Tailwind+shadcn/ui, ma il codice reale **non li usa**: non introdurre Tailwind, segui il sistema di variabili CSS già esistente.
- **Backend**: Supabase (Postgres + Auth + Storage), client unico in `core/supabase.ts`
- **AI**: Google Gemini, chiamata via `fetch` diretto in `services/geminiService.ts` (nessun SDK)
- **Import file**: Mammoth.js (`.docx`), pdf.js (`.pdf`, worker statico in `public/pdf.worker.min.mjs`), Pandoc WASM/Turndown come fallback
- **Export**: libreria `docx` per generare il DOCX finale lato client
- **Validazione dati**: zod
- **Lint/test**: `oxlint` (non eslint), `vitest`

## Architettura e flusso dati

```
UTENTE (browser Windows / smartphone)
        │
   PWA React (Vercel)
        │
   Mammoth.js / pdf.js  ←→  docx.js (export)
        │
   ┌────┴────────┬─────────────────┐
Supabase DB   Supabase Storage   Google Gemini
(pazienti,    (DOCX originali,   (analisi stile,
relazioni,     export)            generazione)
profilo_stile,
sessioni_wizard,
professionista)
```

**Setup una tantum**: import DOCX/PDF → Mammoth/pdf.js → Markdown → salvato in `relazioni` → Gemini analizza il corpus (anonimizzato) → Profilo di Stile (Markdown strutturato) salvato in `profilo_stile`.

**Nuova relazione**: Wizard a sezioni dinamiche → recupera Profilo di Stile + 2-3 relazioni few-shot simili → Gemini genera narrativa per sezione → editor di revisione → export DOCX (l'anagrafica viene ricomposta solo qui, lato client).

## Le due regole non negoziabili

### Regola 1 — l'anagrafica del paziente non arriva mai a Gemini

La regola più importante del progetto: qui si gestiscono dati sanitari di minori.

- Nome, cognome, data di nascita, scuola/classe (`anagrafica`) vengono raccolti in una sezione separata del wizard e **rimossi per costruzione** prima di qualunque prompt:
  ```ts
  const { anagrafica: _anagrafica, ...wizard } = wizardCompleto
  ```
  (vedi `generaRelazione` in `geminiService.ts`, marcata con un commento `⚠️ SICUREZZA DATI` — segui la stessa convenzione se apri un nuovo punto di invio dati a Gemini)
- Il testo generato parla sempre di "il/la paziente", mai per nome
- L'unico dato anagrafico-adiacente che *arriva* davvero a Gemini è `genere`, per la concordanza grammaticale italiana — è una scelta consapevole, non un'eccezione dimenticata
- Le relazioni importate da DOCX/PDF (testo libero, senza questa separazione strutturale) passano invece da `anonimizza.ts` prima di qualsiasi analisi di stile, con anteprima obbligatoria che l'utente deve confermare esplicitamente

Se aggiungi un campo che potrebbe contenere un nome o un dato identificativo, la domanda da farsi è sempre: *deve passare nel payload per Gemini, o restare solo lato client?* Approfondimento completo (placeholder, ordine delle regex, eccezioni come `nome_inviante`): `references/privacy-e-dati-sensibili.md`.

### Regola 2 — Gemini Flash tronca a 8192 token di output: progetta il prompt di conseguenza

Un output che rischia di superare quella soglia va **diviso in chiamate più piccole e mirate** (split-prompt chaining), non compresso a forza nel prompt né "risolto" alzando `maxOutputTokens` (è già al massimo fisico).

Esempi già nel codice da usare come modello:
- Il Profilo di Stile si genera con 2 chiamate parallele — stile (sezioni 1-6) e test clinici (sezione 7) — concatenate lato client (`splitProfilo`)
- L'estrazione dei template test è a due fasi: prima solo nomi/categorie (~100 token), poi il template completo solo per il test scelto dall'utente (~500 token)

Se una nuova funzionalità chiede a Gemini di produrre molto testo strutturato, pensa fin dall'inizio a spezzarla. Approfondimento completo (retry/backoff, fallback modelli, limiti di caratteri hardcoded, mock mode): `references/gemini-e-prompt-chaining.md`.

## Convenzioni di codice

**Stato composto → sempre `useReducer`**, mai `useState` sparsi. Pattern standard:
```ts
export type XAction = { type: 'AZIONE_UNO'; payload: ... } | { type: 'AZIONE_DUE' }
export function xReducer(state: XState, action: XAction): XState {
  switch (action.type) { /* ... */ }
}
```
Riferimento minimale: `components/state/archivioState.ts` o `importRelazioniState.ts`.

**Naming**: i concetti di dominio clinico restano in italiano (`Paziente`, `Relazione`, `anamnesi`, `punteggi`), l'infrastruttura generica resta in inglese (`Id`, `JsonValue`, `UnknownRecord`). Non tradurre né l'uno né l'altro.

**Mapping DB ↔ TS**: nessun ORM. Ogni funzione in `data/*.ts` mappa manualmente `camelCase` (TS) ↔ `snake_case` (colonne Postgres) in entrambe le direzioni, e spesso valida la riga con uno zod schema (`XSchema.parse(...)`) prima di restituirla. Segui lo stesso pattern per un nuovo servizio, non introdurre un client/ORM diverso.

**Commenti**: i punti critici (sicurezza dati, bug non ovvi) sono marcati con `⚠️` e una riga di spiegazione sopra la funzione; i separatori di sezione dentro un file usano `// ── TITOLO ───`. Mantieni lo stesso stile.

**Modalità mock**: `USE_MOCK` (`core/config.ts`) e `USE_MOCK_AI` (`geminiService.ts`) fanno girare l'app senza Supabase/Gemini configurati, usando `src/data/mock*.ts`. Ogni funzione che chiama Supabase o Gemini ha un ramo mock — è una convenzione rispettata ovunque nel codice esistente: se aggiungi una funzione nuova, aggiungi anche il suo ramo mock.

**Punteggi dei test clinici**: le fasce interpretative WISC-IV/NEPSY-II sono calcolate **localmente** da soglie hardcoded (`testDefinitions.ts`), mai da Gemini — l'app non fa mai scoring clinico via AI, solo narrativa attorno a numeri già calcolati in modo deterministico.

**Validazione wizard**: mai accumulata alla fine. Ogni step dichiara i propri campi obbligatori in `validateStep(stepId, data)`; il pulsante "Avanti" si disabilita solo per lo step corrente, con messaggio inline su cosa manca.

## Mappa dei file

| Area | File | Cosa fa |
|---|---|---|
| Tipi condivisi | `core/types.ts` | Fonte di verità per le forme dati (Paziente, Relazione, WizardData...) |
| Config/mock | `core/config.ts` | `USE_MOCK`, `uid()` |
| Supabase client | `core/supabase.ts` | Client unico, punto di partenza di ogni query |
| Chiamate AI | `services/geminiService.ts` | Tutte le funzioni che parlano con Gemini (analisi stile, generazione, rigenerazione sezione, gestione test dinamici), incluso `callGemini` con retry/fallback |
| Anonimizzazione | `services/anonimizza.ts` | Redazione locale (no network) di nomi/date/telefoni/CF prima di mandare testo a Gemini |
| Dati wizard → testo | `services/wizardToText.ts` | Punteggi numerici → tabelle Markdown + narrativa base; condiviso da prompt Gemini ed export |
| Export finale | `services/exportDocx.ts` | Markdown → DOCX (font, margini, tabelle, paragrafo anagrafica) |
| Import file | `services/fileExtractor.ts`, `services/pandocBrowser.ts` | Pipeline DOCX/PDF/DOC → Markdown, con fallback a catena |
| Definizioni test | `components/constants/testDefinitions.ts` | Fonte di verità su campi/subtest/soglie WISC-IV e NEPSY-II |
| Voci anamnesi | `components/constants/anamnesiVoci.ts` | Voci selezionabili per gli step Anamnesi/Osservazione |
| Pagine | `components/pages/*.tsx` | Una pagina per rotta (Dashboard, Archivio, WizardNuovaRelazione, GestioneTest, ProfiloStile, ...) |
| State reducer | `components/state/*.ts` | Reducer + tipi azione per singole pagine/flussi |
| Dati mock | `data/*.ts` | Dataset e funzioni di accesso dati (mappatura camelCase↔snake_case), usati anche quando `USE_MOCK`/`USE_MOCK_AI` sono attivi |
| Schema DB | `supabase_setup.sql` | 5 tabelle + policy RLS — ma **incompleto**: `test_templates` esiste in produzione/nel codice ma non qui, vedi `references/struttura-dati.md` |

## Checklist per task comuni

**Aggiungere un campo al wizard**
1. Tipo in `core/types.ts` (dentro `WizardData` o il sotto-tipo di sezione pertinente)
2. Campo nello step in `components/pages/WizardNuovaRelazione.tsx` + azione reducer
3. Se è clinico/narrativo → passalo nel payload di `geminiService.ts` (mai se identificativo — Regola 1)
4. Se serve nel documento finale → aggiorna `wizardToText.ts` e/o `exportDocx.ts`
5. Se obbligatorio → aggiorna `validateStep`

**Aggiungere una nuova chiamata a Gemini**
1. Stima l'output: se rischia >6-7k token, progetta subito 2+ chiamate mirate (Regola 2)
2. Escludi sempre l'anagrafica dal payload (Regola 1)
3. Aggiungi il ramo `USE_MOCK_AI` con un output fittizio plausibile
4. Passa da `callGemini` esistente (retry/backoff/fallback modelli già gestiti lì), non fetch diretto

**Toccare lo schema Supabase**
1. Aggiorna `supabase_setup.sql` (fonte di verità... ma verifica prima se è già disallineato, vedi sopra)
2. Aggiorna il tipo corrispondente in `core/types.ts`
3. RLS qui è "utente singolo autenticato", non isolamento multi-tenant per riga

## Per approfondire

- `docs-ai/piano_implementazione_relazioni.md` — piano completo, incluso il changelog delle 25 correzioni (il *perché* delle decisioni, non solo il *cosa*)
- `docs-ai/profilo_di_stile.md` — un Profilo di Stile reale generato dall'app: la struttura di output che il Modulo 2 deve produrre
- `references/privacy-e-dati-sensibili.md` — anonimizzazione, cosa può/non può arrivare a Gemini, rischio residuo
- `references/gemini-e-prompt-chaining.md` — `callGemini`, limiti token, split-prompt, few-shot, mock mode
- `references/struttura-dati.md` — schema Supabase (incluso il disallineamento su `test_templates`) e tipi TS
