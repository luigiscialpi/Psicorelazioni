# Privacy e dati sensibili — approfondimento

> Il resoconto completo (misure tecniche, rischio residuo con API key gratuita, autenticazione) è in README §8. Qui: le regole da applicare quando scrivi codice che tocca dati del paziente o chiamate Gemini.

## Perché questo file esiste

PsicoRelazioni tratta dati sanitari di minori (valutazioni neuropsicologiche, diagnosi DSA/ADHD). La privacy non è un dettaglio implementativo ma un vincolo architetturale: l'anonimizzazione non è un filtro finale applicato "prima di inviare", ma una separazione incorporata fin dalla progettazione del flusso dati. Ogni nuova funzionalità che introduce una chiamata AI deve preservarla.

## Il confine di privacy

L'applicazione separa sempre `AnagraficaPaziente` (dati identificativi: nome, cognome, data di nascita, scuola/classe, e i riferimenti accidentali a specialisti/familiari/insegnanti nei testi importati) dal resto dei dati clinici. Prima di costruire un prompt per Gemini, il dominio va sempre diviso in identificativi (mai inviati) e clinici anonimizzati (possono esserlo). Non introdurre nuove chiamate Gemini che ricevano l'intero `WizardData` senza questa separazione esplicita.

**Eccezioni deliberate, non dimenticanze:**
- **Genere** — mantenuto per la concordanza grammaticale italiana della relazione.
- **Nome dell'inviante** — mantenuto solo se l'utente vuole che compaia esplicitamente nel referto finale; se invece è un dato del paziente o un riferimento accidentale, va anonimizzato. La domanda guida è sempre: *l'utente desidera che questa informazione compaia nel documento?*

Nessuna delle due eccezioni autorizza a inviare altri dati anagrafici "per comodità".

## `anonimizza.ts`

`anonimizzaTesto()` lavora interamente lato client (nessuna chiamata di rete) applicando sostituzioni regex progressive sul Markdown, sostituendo con placeholder tipo `[PAZIENTE]`: nome/cognome, data di nascita, titoli professionali con nominativo, telefoni, partita IVA, codice fiscale, indirizzi, scuole, altri riferimenti identificativi. **L'ordine delle sostituzioni è significativo** — una regex introdotta dopo può smettere di matchare se una regex precedente ha già sostituito parte del testo con un placeholder. Quando aggiungi una nuova regola, verifica che non interferisca con quelle esistenti e presta attenzione ai falsi positivi (nomi comuni che coincidono con parole del linguaggio clinico).

**Anteprima obbligatoria**: prima dell'invio a Gemini l'utente deve vedere e confermare il testo anonimizzato. Non è opzionale — qualunque nuovo flusso che avvia un'analisi AI deve passare dallo stesso meccanismo di conferma, mai chiamare direttamente il servizio Gemini bypassandolo.

L'introduzione di `callGeminiStructured()` non cambia queste regole: privacy e validazione Zod sono responsabilità indipendenti, uno schema corretto non rende automaticamente sicuro il contenuto inviato.

## Logging

Durante lo sviluppo, non loggare prompt completi, payload destinati a Gemini, anagrafica, o testi clinici non anonimizzati. Per debug, preferisci identificativi tecnici, conteggi, metadati, o versioni già anonimizzate del payload.

## Limiti dell'anonimizzazione

È basata su pattern/regex, non è una garanzia assoluta — per questo l'app informa sempre l'utente che l'anteprima va controllata e che il contenuto clinico resta un dato sanitario anche senza nome associato. Per un uso professionale continuativo, un'infrastruttura con Data Processing Agreement (es. Vertex AI) sarebbe preferibile alle API gratuite di Google AI Studio (vedi rischio residuo, README §8).

## Autenticazione e RLS

Progettata per un'unica professionista attiva: l'autenticazione è obbligatoria su tutte le route (`ProtectedRoute`). Tutte le tabelle hanno però una colonna `owner_id` (UUID, valorizzata da `auth.uid()`) e RLS che isola le righe per `owner_id`, non solo per "autenticato sì/no" (vedi `supabase_setup.sql`, README §5): l'eccezione sono i `test_templates` `built_in` (WISC-IV/NEPSY-II), condivisi e senza owner. Se il progetto dovesse supportare più professioniste, l'isolamento dati è già in gran parte presente a livello di schema — resterebbe da verificare che ogni nuova query in `data/*.ts` filtri/scriva sempre coerentemente su `owner_id` e non assuma un singolo utente implicito altrove nel codice applicativo.

## Checklist prima di completare modifiche che coinvolgono Gemini

- L'anagrafica è separata prima della costruzione del prompt (destructuring esplicito, non un filtro applicato "a valle")
- Il testo inviato è quello anonimizzato, e il flusso di anteprima non è stato bypassato
- Nessun log contiene dati identificativi
- Il genere non viene trattato come equivalente ad altri dati identificativi (è l'eccezione nota, non un precedente)
