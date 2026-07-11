# Struttura dati — approfondimento

> Schema tabelle, colonne esatte e tipi TS completi sono in README §5 e §6, sempre aggiornati lì. Qui: gli invarianti architetturali e le dipendenze da verificare quando tocchi il modello dati — cose che un elenco di colonne non trasmette da solo.

## Il Markdown è la single source of truth del documento

L'intera pipeline ruota attorno ad esso: il Wizard raccoglie dati strutturati → `wizardToText.ts` costruisce il Markdown deterministico → Gemini genera solo la narrativa da integrare → il `RichTextEditor` modifica quel Markdown (l'HTML dell'editor non è mai la rappresentazione persistente) → `exportDocx.ts` interpreta quel Markdown per produrre il documento finale. Non introdurre rappresentazioni persistenti alternative (HTML, JSON del documento, AST proprietari): il Markdown deve restare l'unico formato condiviso tra editor, AI ed export.

Se cambia la grammatica Markdown, `wizardToText.ts`, `RichTextEditor` ed `exportDocx.ts` vanno verificati insieme — non è un modulo che si può aggiornare isolatamente dagli altri due, perché `exportDocx.ts` non è un parser Markdown generico: riconosce solo la grammatica che il progetto stesso genera.

## Separazione tra logica deterministica e AI

Il client è responsabile di struttura del documento, tabelle, trasformazioni dei punteggi, impaginazione, export DOCX, validazione. Gemini è responsabile esclusivamente della narrativa clinica. Se una trasformazione può essere implementata deterministicamente, deve vivere nel codice dell'applicazione, non nel prompt — anche quando sarebbe più comodo chiedere a Gemini di "sistemare" l'output.

## Le tabelle Supabase

`supabase_setup.sql` documenta lo schema per ricrearlo da zero, ma può disallinearsi dal progetto Supabase reale nel tempo — verifica sempre contro il codice in `data/*.ts` (query dirette) prima di assumere che rispecchi la produzione. Elenco e colonne esatte: README §5.

- **`pazienti`** — l'unico punto in cui possono comparire dati identificativi. Nessun contenuto da questa tabella va mai inviato direttamente a Gemini.
- **`relazioni`** — importate e generate. `wizard_snapshot` contiene sempre il wizard anonimizzato: il sotto-oggetto `anagrafica` non va persistito nello snapshot destinato alla rigenerazione.
- **`profilo_stile`** — un solo record, aggiornato deterministicamente. Non usarlo come archivio generico di prompt.
- **`sessioni_wizard`** — stato temporaneo di una relazione in costruzione, solo a supporto del recupero bozze. Non è la sorgente definitiva dei dati clinici.
- **`professionista`** — dati permanenti dello studio, usati in esportazione. Non devono transitare nei prompt Gemini salvo casi strettamente necessari.
- **`test_templates`** — fonte di verità per tutti i test personalizzati, WISC-IV/NEPSY-II inclusi (vedi sezione sotto). Ogni nuovo test si introduce tramite template, non con logica dedicata nel codice.

## Test clinici: `TestTemplate` è l'unica fonte di verità

Non esistono soglie o campi hardcoded per singoli test nel codice applicativo — WISC-IV e NEPSY-II sono `TestTemplate` come qualunque test personalizzato creato in Gestione Test, senza trattamento speciale nel motore di calcolo. Per aggiungere o modificare un test lavora su:

- **`core/testTemplate.ts`** — schema Zod e tipi (`TestTemplate`, `RisultatoTest`, `CampoTest`, `GruppoTest`). Modificare la forma di un `TestTemplate` si fa qui, non con cast sparsi altrove.
- **`services/testTemplateEngine.ts`** — motore generico, puramente deterministico (nessuna chiamata AI): calcolo delle fasce interpretative dato un punteggio e una scala, generazione della tabella/sezione Markdown, e `buildGeminiPayload()` (il testo grezzo — mai tabelle già renderizzate — che Gemini riceve per scrivere il commento narrativo).

Se introduci un nuovo test con un comportamento che il template non riesce a esprimere via configurazione, quella è l'eccezione da giustificare esplicitamente, non il default.

## Tipi TypeScript principali (`core/types.ts`, `core/testTemplate.ts`)

- **`AnagraficaPaziente`** — il confine di privacy dell'applicazione. Prima di costruire un prompt per Gemini questi dati vanno sempre separati dal resto del modello (invariante architetturale, non una convenzione da ricordare caso per caso).
- **`WizardData`** — modello interno del wizard: risposte delle sezioni, configurazione dinamica, anagrafica, risultati dei test. Non è il documento finale — la trasformazione a Markdown è responsabilità esclusiva di `wizardToText.ts`.
- **Pattern CRUD per entità**: `XInput`, `XPatch`, schema Zod, mapping DB ⇄ dominio. Segui questo pattern per una nuova tabella invece di introdurne uno diverso.

## Mapping DB ↔ TypeScript

Nessun ORM. Ogni servizio converte manualmente `snake_case` (database) ↔ `camelCase` (dominio TypeScript) in entrambe le direzioni. Quando aggiungi un campo, aggiorna tutte le operazioni CRUD che toccano quella tabella — non limitarti a una singola funzione, è un errore facile da fare perché il codice compila comunque. Prima che un record entri nel dominio applicativo, validalo con lo schema Zod corrispondente; non usare `as` per aggirare la validazione.

## Dipendenze da verificare quando modifichi

| Se modifichi... | Verifica anche... |
|---|---|
| `TestTemplate` | wizard, suggerimenti AI, `buildGeminiPayload`, export |
| `wizardToText.ts` | `RichTextEditor`, `exportDocx.ts`, prompt Gemini, test |
| la grammatica Markdown | editor, export, parser, snapshot esistenti in archivio |
| lo schema Supabase | mapping in `data/*.ts`, schema Zod, tipi TypeScript, RLS |

## Errori da evitare

- Usare HTML o un JSON proprietario come sorgente persistente del documento al posto del Markdown
- Duplicare una trasformazione punteggio→testo già presente in `wizardToText.ts` in un altro punto (componente React, export, prompt)
- Delegare a Gemini un calcolo deterministico (fasce interpretative, indici derivati)
- Introdurre un caso speciale nel codice per un test specifico quando può essere modellato tramite `TestTemplate`
- Aggiornare solo parte del mapping DB ⇄ TypeScript dopo aver aggiunto un campo
