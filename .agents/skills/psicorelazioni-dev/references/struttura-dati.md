# Struttura dati — approfondimento

## Le tabelle Supabase

`supabase_setup.sql` ne documenta 5, ma il codice reale ne usa 6 — vedi la nota in fondo.

**`pazienti`** — anagrafica reale (nome, cognome, data di nascita, scuola/classe) + metadati anonimi (età approssimativa, sesso, tipo consulto). Protetta solo da autenticazione + RLS, nessuna cifratura applicativa aggiuntiva (scelta esplicita, da rivalutare se l'uso si espande oltre l'ambito personale). `codice` è un riferimento interno facoltativo, non più la chiave identificativa principale come nella prima versione del piano.

**`relazioni`** — sia le relazioni importate (`tipo = 'importata'`) sia quelle generate (`tipo = 'generata'`). Contiene `testo_markdown` (contenuto), `testo_originale_path` (backup su Storage), `wizard_snapshot` (JSONB — tutte le risposte del wizard **escluso `anagrafica`**, per poter riaprire e modificare senza duplicare la relazione), `tag` (array, per il matching few-shot).

**`profilo_stile`** — un solo record (`id = 1` sempre). `documento_stile` è il Markdown strutturato prodotto da Gemini; `num_relazioni_analizzate` guida l'aggiornamento incrementale deterministico (non basato solo su timestamp).

**`sessioni_wizard`** — bozze in corso, salvate con debounce di 1.5s a ogni risposta. `risposte_wizard` (JSON), `bozza_generata`, collegamento a `relazione_finale_id` dopo l'export.

**`professionista`** — record singolo con i dati fissi dello studio (nome, titolo, specializzazione, contatti, P.IVA/CF, `genere`) da riportare nell'intestazione DOCX invece di richiederli a ogni wizard.

**`test_templates`** (⚠️ non presente in `supabase_setup.sql`) — usata da `data/testTemplatesData.ts` per il CRUD dei template di test personalizzati (Modulo 2b / Gestione Test). Colonne reali, ricavate dal codice: `id, nome, categoria, scala_default, campi_principali, gruppi_secondari, nota_range, richiede_eta_valutazione, richiede_strumenti_utilizzati, built_in, attivo, schema_version, created_at, updated_at`. Se devi rigenerare l'istanza Supabase da zero, questa tabella va creata a mano finché `supabase_setup.sql` non viene aggiornato — non assumere che lo script SQL sia completo.

Tutte le tabelle: RLS attiva, policy "utente autenticato" (app single-user, non multi-tenant).

## Tipi TypeScript principali (`core/types.ts`)

- `AnagraficaPaziente` — il sotto-tipo isolato che non deve mai raggiungere Gemini (Regola 1 nel SKILL.md principale)
- `Paziente = AnagraficaPaziente & { id, codice, eta_approssimativa, sesso, tipo_consulto, ... }`
- `Relazione` — specchio della tabella omonima
- `WizardData` — `UnknownRecord` estesa con `sezioni_attive`, `anagrafica`, `test_risultati`; i campi delle singole sezioni (cognitivo, nepsy, anamnesi...) non sono tipizzati singolarmente qui, vivono come shape implicite nei componenti dei singoli step
- Pattern generico per i servizi: `XInput = Omit<X, 'id' | 'created_at'>`, `XPatch = Partial<XInput>` — segui questo pattern per un nuovo servizio CRUD invece di inventarne uno diverso

## Mapping DB ↔ TS

Nessun ORM. Ogni funzione in `data/*.ts` mappa manualmente `camelCase` (proprietà TS, es. `scalaDefault`) ↔ `snake_case` (colonna Postgres, es. `scala_default`) in entrambe le direzioni — vedi `testTemplatesData.ts` come esempio completo (get/insert/update fanno tutti la conversione a mano). Molte di queste funzioni validano anche la riga con uno zod schema (`XSchema.parse(...)`) prima di restituirla al chiamante. Se aggiungi un campo, aggiorna la mappatura in *ogni* funzione che tocca quella tabella, non solo in una.

## Test clinici: dove vive la fonte di verità

`components/constants/testDefinitions.ts` è la fonte di verità per WISC-IV e NEPSY-II: campi/indici, i 3 subtest predefiniti per indice WISC-IV (`WISC_IV_SUBTEST_PER_INDICE`), e le funzioni che calcolano la fascia interpretativa (`fasciaWISC`, `fasciaScalare`) da soglie standard **hardcoded**, verificate contro documenti reali — mai da Gemini, mai configurabili a runtime.

Per test *personalizzati* oltre WISC-IV/NEPSY-II (CBCL, Conners, AC-MT, BVSCO...): CRUD con soft-delete (flag `attivo`, distinto da `built_in` che protegge i test predefiniti dalla cancellazione), suggerimenti AI da archivio (`suggerisciTestDaArchivio`) ed estrazione on-demand dal Profilo di Stile a due fasi (vedi `references/gemini-e-prompt-chaining.md`).

## `wizardToText.ts` — il ponte tra dati puliti e testo

Trasforma punteggi numerici (oggetti piatti come `{ vc: 9, so: 11 }`) in tabelle Markdown (`wiscToMarkdownTable`, `nepsyToMarkdownTable`) e narrativa di base (`wiscToNarrativa`, `wiscSubtestPpToNarrativa`). Condiviso sia dal payload per Gemini sia dall'export DOCX — è il posto giusto per una nuova trasformazione punteggio→testo, per evitare di duplicare la logica in due posti come già successo (e corretto) in passato.
