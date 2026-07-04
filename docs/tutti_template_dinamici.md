# Ristrutturazione Completa e Unificazione dell'Architettura dei Test (Completato)

## Obiettivo

Rendere l'architettura dei test clinici 100% data-driven e unificata, rimuovendo le "vie preferenziali" cablate (hardcoded) per la WISC-IV e la NEPSY-II. Tutti i test (inclusi i due storici) passeranno dallo stesso flusso basato su `TestTemplate`. 

Inoltre, estendiamo i **Template Dinamici** per consentire a tutti i test (attuali e futuri) di definire:
1. **Formule di calcolo automatico**: per automatizzare il calcolo di punteggi totali o indici di sintesi (es. IAG/ICC o punteggio Totale CBCL) a partire dai subtest.
2. **Colonne/Scale multiple**: per supportare test che richiedono la visualizzazione contemporanea di più metriche (es. Punti T e Percentili).

---

## User Review Required

> [!IMPORTANT]
> **Compatibilità dati storici**: Per evitare migrazioni batch complesse sul database Supabase, le relazioni esistenti che usano le colonne legacy `cognitivo` e `nepsy` verranno migrate **al volo (in-memory)** al momento del caricamento client (hydration). 
> Il salvataggio di nuove relazioni scriverà esclusivamente all'interno del campo JSONB unificato `test_risultati`, lasciando le colonne legacy `cognitivo` e `nepsy` a `NULL` o vuote.

---

## Proposed Changes

### 1. Types & Core Abstractions

#### [MODIFY] [src/core/testTemplate.ts](src/core/testTemplate.ts) (Completato)
- Aggiunge `FormulaCalcoloSchema` per mappare le formule (es. `{targetKey: 'iag', espressione: '({somiglianze} + {vocabolario} + {informazioni}) * 1.5'}`).
- Estende `TestTemplateSchema` con:
  - `formule: z.array(FormulaCalcoloSchema).optional()`
  - `colonne: z.array(z.string()).default(['Punteggio'])` (es. `['Punteggio', 'Percentile']` per CBCL).
- Estende `RisultatoTest` per contenere i punteggi delle colonne addizionali usando la convenzione piatta `punteggi[campoKey + '_' + colonna]`.

---

### 2. Database & Data Layer

#### [MODIFY] [src/data/testTemplatesData.ts](src/data/testTemplatesData.ts) (Completato)
- Aggiunge e mappa le colonne `formule` (JSONB) e `colonne` (JSONB) allo schema delle tabelle per il recupero dati da Supabase.
- Aggiorna i payload di creazione (`insertTestTemplate`) e salvataggio (`updateTestTemplate`) per mappare queste nuove colonne.

#### [MODIFY] [src/data/mockTemplates.ts](src/data/mockTemplates.ts) (Completato)
- Aggiorna i due template built-in `MOCK_WISC_IV_TEMPLATE` e `MOCK_NEPSY_II_TEMPLATE` inserendo le colonne predefinite e lasciandoli pronti ad ospitare formule di calcolo.

---

### 3. Migrazione Dinamica (Hydration)

#### [MODIFY] [src/services/testTemplateEngine.ts](src/services/testTemplateEngine.ts) (Completato)
- Creata la funzione helper `migraWizardSnapshotLegacy(raw: any): any` per convertire al volo lo stato legacy (`raw.cognitivo` e `raw.nepsy`) nel nuovo dizionario unificato `raw.test_risultati['wisc-iv']` e `raw.test_risultati['nepsy-ii']` e rimappare gli identificativi dentro `sezioni_attive`.

Questa funzione viene invocata in:
#### [MODIFY] [src/components/pages/WizardNuovaRelazione.tsx](src/components/pages/WizardNuovaRelazione.tsx) (Completato) (durante l'inizializzazione/caricamento bozza)
#### [MODIFY] [src/components/pages/Archivio.tsx](src/components/pages/Archivio.tsx) (Completato) (durante il recupero delle relazioni storiche)
#### [MODIFY] [src/components/pages/RisultatoGenerazione.tsx](src/components/pages/RisultatoGenerazione.tsx) (Completato) (durante la visualizzazione)

---

### 4. Motore dei Test (Template Engine)

#### [MODIFY] [src/services/testTemplateEngine.ts](src/services/testTemplateEngine.ts) (Completato)
- Implementa `valutaFormule(template: TestTemplate, punteggi: Record<string, any>): Record<string, any>` che calcola in tempo reale i valori delle formule matematiche/aritmetiche in modo sicuro, escludendo injection arbitrarie.
- Estende `generaTabella` per formattare la tabella Markdown dinamicamente in base alle `colonne` configurate nel template e supportando colonne multiple.

---

### 5. Wizard & UI

#### [MODIFY] [src/components/pages/WizardNuovaRelazione.tsx](src/components/pages/WizardNuovaRelazione.tsx) (Completato)
- Rimuove lo stato iniziale `cognitivo` e `nepsy` e i relativi reducer legacy.
- Aggiorna `validateStep` e `StepTestGenerico` per utilizzare esclusivamente `test_risultati` con gli ID `wisc-iv` e `nepsy-ii`.
- Estende la griglia dei campi in `StepTestGenerico` per renderizzare caselle di testo per ogni colonna aggiuntiva specificata in `template.colonne` ed esegue il calcolo in tempo reale tramite `valutaFormule`.

---

### 6. Generazione Documento Word & MD

#### [MODIFY] [src/services/wizardToText.ts](src/services/wizardToText.ts) (Completato)
- Elimina completamente i blocchi cablati per `cognitivo` e `nepsy` in `assemblaDocumentoMarkdown` e itera dinamicamente su `sezioni_attive` cercando i template associati in `test_risultati`.
- Rimosse le vecchie funzioni helper duplicate o non scalabili come `notaRangeWisc()` e `notaRangeNepsy()`.

#### [MODIFY] [src/services/exportDocx.ts](src/services/exportDocx.ts) (Completato)
- Rimuove le funzioni speciali non scalabili `notaRangeWisc` e `notaRangeNepsy` da `wizardToText.ts`. 
- Unifica l'inserimento dei range-notes sotto le tabelle recuperandoli direttamente da `MOCK_WISC_IV_TEMPLATE.notaRange` e `MOCK_NEPSY_II_TEMPLATE.notaRange` nel medesimo metodo unificato.
- Estende `makeTestTable` per generare una griglia Word nativa coerente con la definizione di colonne e gruppi secondari del template corrente.

#### [MODIFY] [src/services/geminiService.ts](src/services/geminiService.ts) (Completato)
- Risolti gli errori di typecheck relativi a `ScoreMap` convertendo con continuità e validazioni i punteggi nel tipo atteso `Record<string, string | number>` per l'invio all'API di Gemini.
- Aggiornata la firma della funzione `generaRelazione` per incorporare i template dinamici attivi nel payload e migliorare la precisione della narrativa generata.

---

## Verification Plan

### Automated Tests
- Eseguire i test in [src/services/testTemplateEngine.test.ts](src/services/testTemplateEngine.test.ts) per validare le nuove funzioni di calcolo formule, migrazione dei snapshot legacy e generazione colonne dinamiche.
  - *Comando*: `npx vitest run` (Risultato: **12 test superati su 12**).
- Eseguire typecheck completo per assicurarsi della mancanza di regressioni o errori di compilazione nel progetto.
  - *Comando*: `npm run typecheck` o `npx tsc -b` (Risultato: **Nessun errore di compilazione**).

### Manual Verification
1. Creare una relazione compilando WISC-IV e NEPSY-II: verificare che la UI si comporti in modo identico e i punteggi vengano salvati correttamente.
2. Aprire una relazione storica dall'archivio: verificare che i dati legacy vengano caricati e visualizzati correttamente nel wizard.
3. Generare il DOCX per una relazione con WISC-IV e NEPSY-II e verificare che le tabelle Word siano identiche e non abbiano perdite di formattazione ("diff zero").
4. Creare un test custom con colonne multiple (es. Punti T e Percentili) e formule (es. somma dei subtest) in Gestione Test: verificare che nel wizard e nel report finale appaia tutto correttamente.
