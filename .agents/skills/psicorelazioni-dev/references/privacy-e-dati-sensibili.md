# Privacy e dati sensibili — approfondimento

## Perché questo file esiste

PsicoRelazioni tratta dati sanitari di minori (valutazioni neuropsicologiche, diagnosi DSA/ADHD). Non è un dettaglio implementativo qualsiasi: è il vincolo che ha guidato più correzioni di ogni altra parte del progetto (vedi in particolare le correzioni 3, 6, 11, 21, 22, 23 in `docs-ai/piano_implementazione_relazioni.md`).

## Cosa non arriva mai a Gemini

- Nome, cognome, data di nascita, scuola/classe del paziente (`anagrafica`) — rimossi per destructuring prima di ogni prompt in `geminiService.ts`
- Chiunque venga nominato incidentalmente in un testo libero importato (altri specialisti, familiari) — sostituito con `[PERSONA]` da `anonimizza.ts`

## Cosa arriva a Gemini, e perché è un'eccezione consapevole

- **`genere`** (maschio/femmina) del paziente — serve per la concordanza grammaticale italiana ("il minore accetta" vs "la ragazzina accetta"). È l'unico dato anagrafico-adiacente presente nel payload.
- **`nome_inviante`** (es. "dott.ssa Maria Rossi", il professionista che invia il paziente) — a differenza dei nomi citati incidentalmente in anamnesi, questo nome è *voluto* nel testo finale ("su segnalazione della Dott.ssa Rossi..."). Non passa dal filtro di anonimizzazione: sostituirlo con `[PERSONA]` produrrebbe l'opposto di quanto richiesto.

Se stai lavorando su un campo simile, la domanda guida è: *l'utente vuole vedere questo dato per esteso nel referto?* Se sì, non anonimizzarlo. Se è un dato del paziente o di un terzo menzionato incidentalmente, anonimizzalo.

## `anonimizza.ts` — come funziona

Applica sostituzioni locali, **senza chiamate di rete**, sul testo Markdown prima di `analizzaStile`/`aggiornaProfiloIncrementale`. L'ordine conta, perché regole successive operano su testo già ripulito dalle precedenti:

1. Nome+cognome del paziente collegato (se noto via `paziente_id`) → `[PAZIENTE]`
2. Pattern "Nome Cognome, nato/a il..." in testo libero → `[PAZIENTE]` + `[DATA]`
3. Date dopo "nato/nata (il)" → `[DATA]`
4. Titoli professionali + nome (dott./dott.ssa/dr./prof...) → `[PERSONA]`
5. Telefoni (con e senza prefisso esplicito) → `[TELEFONO]`
6. Partita IVA → `[PIVA]`
7. Codice fiscale → `[CF]`
8. Indirizzi (via/piazza/corso + numero) → `[INDIRIZZO]`
9. Nomi di scuole/istituti → `[SCUOLA]`

Nota tecnica se estendi le regex: nel pattern dei titoli professionali, il titolo è case-insensitive tramite una classe di caratteri esplicita, ma il nome proprio che segue resta case-sensitive (richiede maiuscola vera). Un flag `/i` globale su quella regex catturerebbe per errore parole minuscole comuni come "presso" — bug reale osservato e corretto in passato con la frase "dott.ssa Concetta De Giambattista presso il Cepsia".

## L'anteprima è obbligatoria, non un nice-to-have

In `ProfiloStile.tsx`, prima di confermare l'invio a Gemini per l'analisi di stile, l'utente **deve vedere** il testo anonimizzato con le sostituzioni evidenziate e confermare esplicitamente ("Ho verificato, procedi con l'analisi"). Nessun percorso di codice deve poter bypassare questa anteprima: se aggiungi un nuovo modo di avviare l'analisi (es. un pulsante rapido da un'altra pagina), deve passare dallo stesso step di conferma, non chiamare `analizzaStile` direttamente.

## Il rischio residuo, onestamente

L'anonimizzazione è euristica (pattern/regex), non garantita al 100% — un avviso persistente lo ricorda all'utente. Anche perfettamente anonimizzato, il contenuto clinico (osservazioni, punteggi, diagnosi) resta un dato sanitario. La Gemini API gratuita usata in sviluppo potrebbe essere usata da Google per migliorare i propri modelli: per un uso professionale reale e continuativo, il progetto stesso raccomanda di valutare Vertex AI con un DPA (Data Processing Agreement) firmato, non l'API gratuita di AI Studio. Non presentare l'anonimizzazione come una soluzione completa in nessuna funzionalità nuova che tocchi questo flusso.

## Autenticazione e RLS

Utente singola (la psicologa), non multi-tenant. Le policy RLS su tutte le tabelle sono semplicemente "utente autenticato" (`auth.role() = 'authenticated'`), non isolamento per riga/utente. Se il progetto dovesse mai supportare più professionisti, questo è il primo punto da rivedere.
