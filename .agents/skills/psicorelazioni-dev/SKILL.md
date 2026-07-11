---
name: psicorelazioni-dev
description: Guida sviluppo PsicoRelazioni (React/TS/Vite, Supabase, Gemini). Usa sempre lavorando nel repo o toccando geminiService.ts, wizardToText.ts, exportDocx.ts, testTemplateEngine.ts, wizard o archivio.
---

# PsicoRelazioni — Development Skill

> **`README.md` alla radice del repo è l'unica fonte di verità per stack, architettura, schema dati e flusso di generazione — leggilo prima di modificare qualunque cosa.** Questa skill non lo riassume: contiene solo le regole operative, gli invarianti e le checklist che un README scritto per persone non trasmette automaticamente a un agente — cosa non va mai rotto, dove propagare una modifica, gli errori tipici che un modello tende a fare su questo codebase. In caso di conflitto tra questa skill e il codice reale, vince il codice: segnalalo, non ignorarlo in silenzio.

## Cos'è il progetto

PWA che aiuta una neuropsicologa a scrivere relazioni di valutazione neuropsicologica e dell'apprendimento in età evolutiva (WISC-IV, NEPSY-II, CBCL/YSR, AC-MT, BVSCO — diagnosi DSA/ADHD ai sensi della L. 170/2010), mantenendo il suo stile di scrittura personale imparato dalle relazioni passate. Utente unica (la psicologa), sia da PC Windows che da smartphone.

Flusso in una riga: import relazioni passate → Gemini distilla un Profilo di Stile → wizard guidato per il nuovo caso → Gemini genera narrativa nello stile appreso → editor di revisione → export DOCX → archivio consultabile. Dettagli completi: README §3.

## Le due regole non negoziabili

Vanno rispettate anche quando la richiesta dell'utente non le menziona esplicitamente: sono l'unico punto del progetto dove un errore ha conseguenze concrete (dati sanitari di minori) o rompe silenziosamente la generazione (troncamento).

### 1 — L'anagrafica del paziente non arriva mai a Gemini

Nome, cognome, data di nascita, scuola/classe vengono rimossi per costruzione prima di qualunque prompt (`generaRelazione` in `geminiService.ts`, commentato `⚠️ SICUREZZA DATI` — segui la stessa convenzione se apri un nuovo punto di invio dati a Gemini):
```ts
const { anagrafica: _anagrafica, ...wizard } = wizardCompleto
```
Le uniche eccezioni deliberate sono `genere` (concordanza grammaticale italiana) e, se l'utente lo desidera nel documento finale, `nome_inviante`. Se aggiungi un campo che potrebbe contenere un dato identificativo, la domanda è sempre: *deve arrivare a Gemini o restare solo lato client?* Le relazioni importate da DOCX/PDF (testo libero, senza questa separazione strutturale) passano invece da `anonimizza.ts` prima di qualsiasi analisi di stile, con anteprima obbligatoria che l'utente deve confermare esplicitamente. Approfondimento: `references/privacy-e-dati-sensibili.md`, README §8.

### 2 — L'output strutturato di Gemini tronca a 8192 token

Un output che rischia di superare quella soglia va **diviso in chiamate più piccole e mirate** (prompt chaining), non compresso a forza nel prompt né "risolto" alzando `maxOutputTokens` (è già al massimo fisico). Esempi già nel codice da usare come modello: la generazione della narrativa spezza le sezioni attive in blocchi di al massimo 3; l'estrazione dei template test è a due fasi (prima solo nomi/categorie, poi il template completo solo per il test scelto). Se una nuova funzionalità chiede a Gemini di produrre molto testo strutturato, pensa fin dall'inizio a spezzarla. Approfondimento: `references/gemini-e-prompt-chaining.md`, README §7.

## Cose che vale la pena sapere prima di toccare il codice

- **Due canali verso Gemini convivono, non uno solo**: `callGemini`/`callGeminiWithFinishReason` (fetch diretto contro il REST endpoint, per prosa libera) e `callGeminiStructured` (SDK ufficiale `@google/genai`, output JSON validato con Zod). Nessuno dei due è "quello legacy" — servono a cose diverse. Quando aggiungi una chiamata, la domanda che decide quale usare è: la risposta deve avere una forma precisa (elenco, oggetto) o è prosa discorsiva?
- **`TestTemplate` è l'unica fonte di verità per i test clinici**, WISC-IV e NEPSY-II inclusi: non esistono (più) soglie o campi hardcoded per singoli test nel codice applicativo. Per aggiungere o modificare un test lavora su `core/testTemplate.ts` / `services/testTemplateEngine.ts`, non introdurre un `if (nomeTest === 'wisc-iv')` altrove.
- **`buildGeminiPayload()` non manda mai a Gemini contenuto già formattato** (tabelle, corsivo, citazioni): solo dati grezzi (label/punteggio/fascia). Un LLM a cui si mostra contenuto già impaginato appena prima di chiedergli un commento tende a farne l'eco nella risposta invece di commentarlo. Mantieni questa disciplina se estendi il payload.
- **`supabase_setup.sql` va verificato, non dato per buono**: è lo script per ricreare lo schema da zero, ma può disallinearsi dal progetto Supabase reale (è già successo). La fonte di verità sui nomi colonna resta il codice in `data/*.ts` e README §5.

## Convenzioni di codice

**Stato composto → sempre `useReducer`**, mai `useState` sparsi. Pattern standard:
```ts
export type XAction = { type: 'AZIONE_UNO'; payload: ... } | { type: 'AZIONE_DUE' }
export function xReducer(state: XState, action: XAction): XState {
  switch (action.type) { /* ... */ }
}
```
Riferimento minimale: `components/state/archivioState.ts` o `importRelazioniState.ts`.

**Mapping DB ↔ TS**: nessun ORM. Ogni funzione in `data/*.ts` mappa manualmente `camelCase` (TS) ↔ `snake_case` (colonne Postgres) in entrambe le direzioni, e spesso valida la riga con uno zod schema (`XSchema.parse(...)`) prima di restituirla. Segui lo stesso pattern per un nuovo servizio, non introdurre un client/ORM diverso.

**Commenti**: i punti critici (sicurezza dati, bug non ovvi) sono marcati con `⚠️` e una riga di spiegazione sopra la funzione; i separatori di sezione dentro un file usano `// ── TITOLO ───`. Mantieni lo stesso stile.

**Modalità mock**: `USE_MOCK` (`core/config.ts`) e `USE_MOCK_AI` (`geminiService.ts`) fanno girare l'app senza Supabase/Gemini configurati, usando `src/data/mock*.ts`. Ogni funzione che chiama Supabase o Gemini ha un ramo mock — è rispettata ovunque nel codice esistente: se aggiungi una funzione nuova, aggiungi anche il suo ramo mock, altrimenti l'app (e la suite Vitest, che gira in mock mode) smette di funzionare senza credenziali reali.

**Validazione wizard**: mai accumulata alla fine. Ogni step dichiara i propri campi obbligatori in `validateStep(stepId, data)`; il pulsante "Avanti" si disabilita solo per lo step corrente, con messaggio inline su cosa manca.

## Dipendenze da verificare quando modifichi

| Se tocchi... | Verifica anche... |
|---|---|
| `geminiService.ts` | comportamento SDK vs REST, mock, retry, cascata modelli |
| `wizardToText.ts` | `RichTextEditor`, `exportDocx.ts`, prompt Gemini, test |
| `TestTemplate` / `testTemplateEngine.ts` | schema Zod, rendering tabella, `buildGeminiPayload`, wizard |
| la grammatica Markdown del documento | lo stesso trio sopra: editor, export, parser |
| lo schema Supabase | `core/types.ts`, mapping in `data/*.ts`, schema Zod, RLS |

Per l'elenco completo dei file e cosa fa ciascuno: README §4. Non lo duplichiamo qui perché cambia più spesso di quanto questa skill venga aggiornata — è già successo che un file elencato qui non esistesse più nel codice.

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
3. Scegli `callGemini` (prosa libera) o `callGeminiStructured` (forma precisa, validata con Zod) in base al tipo di risposta attesa
4. Aggiungi il ramo `USE_MOCK_AI` con un output fittizio plausibile
5. Passa dalle funzioni `callGemini*` esistenti (retry/backoff/cascata modelli già gestiti lì), non fetch diretto ad-hoc

**Aggiungere o modificare un test clinico**
1. Lavora su `TestTemplate` (`core/testTemplate.ts`), non aggiungere casi speciali dedicati nel codice
2. Verifica `testTemplateEngine.ts`: calcolo fasce, tabella, narrativa per il payload Gemini
3. Se il test ha subtest/gruppi, verifica che vengano descritti a parole nella narrativa, mai come tabella

**Toccare lo schema Supabase**
1. Aggiorna `supabase_setup.sql` — ma verifica prima con `data/*.ts` se è già disallineato dal codice reale
2. Aggiorna il tipo corrispondente in `core/types.ts`
3. RLS qui è "utente singolo autenticato", non isolamento multi-tenant per riga

## Per approfondire

- `README.md` (root del repo) — stack, architettura, schema dati, sistema TestTemplate, generazione Gemini, privacy: sempre la fonte di verità
- `docs/profilo_di_stile.md` — un Profilo di Stile reale generato dall'app: la struttura di output che l'analisi di stile deve produrre
- `references/privacy-e-dati-sensibili.md` — anonimizzazione, cosa può/non può arrivare a Gemini, rischio residuo
- `references/gemini-e-prompt-chaining.md` — i due canali Gemini, retry/fallback, split-prompt, mock mode
- `references/struttura-dati.md` — schema Supabase, tipi TS, sistema TestTemplate, dipendenze tra moduli
