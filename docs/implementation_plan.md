# Piano di Implementazione - Migrazione a Routing URL-Based

Questo piano descrive i passaggi tecnici necessari per migrare il sistema di navigazione as-is basato su uno stato interno `page` in `App.jsx` a un sistema di routing dichiarativo con `react-router-dom`.

## User Review Required

> [!IMPORTANT]
> - Verrà installata una nuova dipendenza: `react-router-dom` (v6 o v7, compatibile con React 19).
> - La navigazione basata su callback `onNav` sarà rimossa a favore degli hook standard di React Router (`useNavigate`, `NavLink`, `useLocation`).
> - Per preservare il corretto funzionamento di ripristino bozza e modifica relazione dopo il reload della pagina, implementeremo il recupero dei dati tramite query parameters (`/nuova?relazioneId=...` e `/nuova?sessionId=...`).

## Open Questions

> [!NOTE]
> Nessuna domanda bloccante al momento. Il comportamento desiderato è interamente allineato con le specifiche del piano implementativo del cliente.

---

## Proposed Changes

### Core & Routing Foundation

#### [MODIFY] [package.json](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/package.json)
- Aggiungere `"react-router-dom": "^6.22.0"` (o versione compatibile con React 19) alle dipendenze.

#### [MODIFY] [main.jsx](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/main.jsx)
- Avvolgere il componente `<App />` nel provider `<BrowserRouter>`.

#### [MODIFY] [dataService.js](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/dataService.js)
- Aggiungere la funzione `getSessioneById(id)` per supportare il recupero di una bozza specifica tramite query parameter.

#### [MODIFY] [App.jsx](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/App.jsx)
- Rimuovere lo stato `page`, `wizardResult` e `wizardDatiIniziali` dal reducer.
- Configurare il router tree con `Routes` e `Route`.
- Creare un layout comune `Layout` che renderizza la `Sidebar` e l'`Outlet`.
- Creare un componente `ProtectedRoute` che reindirizza a `/auth` se non c'è sessione attiva.
- Configurare le seguenti rotte:
  - `/auth` -> `AuthScreen` (se autenticato, redirect a `/dashboard`)
  - `/dashboard` -> `Dashboard`
  - `/import` -> `ImportRelazioni`
  - `/stile` -> `ProfiloStile`
  - `/professionista` -> `ProfiloProfessionista`
  - `/archivio` -> `Archivio`
  - `/nuova` -> `WizardNuovaRelazione` (con gestione query param `relazioneId` o `sessionId`)
  - `/risultato` -> `RisultatoGenerazione` (con recupero dati da location state)
  - `*` -> redirect a `/dashboard`

---

### Layout & Navigation Components

#### [MODIFY] [Sidebar.jsx](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/Sidebar.jsx)
- Sostituire i tag `<button>` di navigazione con `<NavLink>` o `<Link>` di `react-router-dom`.
- Calcolare lo stato attivo delle voci della sidebar usando la proprietà `isActive` fornita da `NavLink` o confrontando il `pathname` corrente tramite `useLocation()`.

#### [MODIFY] [Dashboard.jsx](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/Dashboard.jsx)
- Rimuovere la prop `onNav` e `onApriInWizard`.
- Usare `useNavigate` per reindirizzare a `/nuova`, `/import`, `/stile`.
- Per riprendere una bozza: navigare a `/nuova?sessionId=ID` (passando opzionalmente l'oggetto nello state come scorciatoia).

#### [MODIFY] [Archivio.jsx](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/Archivio.jsx)
- Rimuovere la prop `onApriInWizard`.
- Usare `useNavigate` per reindirizzare a `/nuova?relazioneId=ID` in caso di modifica.

---

### Wizard & Result Flows

#### [MODIFY] [WizardNuovaRelazione.jsx](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/WizardNuovaRelazione.jsx)
- Rimuovere la prop `datiIniziali`.
- Leggere `relazioneId` e `sessionId` tramite `useSearchParams()`.
- Aggiungere un effetto di caricamento iniziale: se è presente uno dei due parametri, caricare i dati corrispondenti (tramite `getRelazioneById` + `getPazienteById` per `relazioneId`, o `getSessioneById` per `sessionId`) e popolare lo stato locale del wizard.
- Mostrare uno spinner o skeleton durante il caricamento dei dati di inizializzazione.
- Quando si preme su "Genera relazione", navigare a `/risultato` passando lo snapshot dei dati tramite `navigate('/risultato', { state: { wizardData: data } })`.

#### [MODIFY] [RisultatoGenerazione.jsx](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/RisultatoGenerazione.jsx)
- Rimuovere la prop `wizardData` e `onBack`.
- Ottenere `wizardData` da `useLocation().state?.wizardData`. Se assente (ad esempio per caricamento diretto dell'URL), reindirizzare l'utente a `/nuova` o mostrare un messaggio di errore/avviso.
- Modificare il pulsante "Indietro" per tornare a `/nuova` (usando `useNavigate()`).

---

### Deploy Configuration

#### [NEW] [vercel.json](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/vercel.json)
- Configurare le regole di rewrite per Single Page Application per evitare errori 404 in caso di hard refresh su rotte diverse da `/`.

---

## Verification Plan

### Automated Tests
- Eseguire `npm run lint` per verificare la correttezza formale del codice e l'assenza di errori di oxlint.
- Eseguire `npm run build` per verificare che la build Vite vada a buon fine senza errori.

### Manual Verification
- **Verifica Login/Logout**:
  - Accedere all'applicazione ed essere reindirizzati a `/dashboard`.
  - Provare a navigare a `/auth` da loggati e verificare il redirect automatico a `/dashboard`.
  - Cliccare su Esci e verificare di essere riportati a `/auth`.
  - Tentare di accedere a `/dashboard` senza sessione attiva e verificare il redirect a `/auth`.
- **Verifica Navigazione Sidebar**:
  - Cliccare su ogni voce della barra laterale e controllare che l'URL cambi coerentemente.
  - Verificare che la voce corrente nella sidebar sia evidenziata correttamente.
- **Verifica Flusso Wizard & Bozza**:
  - Avviare una nuova relazione, compilare alcuni campi e attendere l'autosalvataggio della bozza.
  - Tornare al pannello (`/dashboard`), ricaricare la pagina, e cliccare su "Riprendi" per verificare il ripristino dello stato e la presenza dei parametri corretti nell'URL.
  - Testare il refresh della pagina sulla rotta `/nuova?sessionId=ID` per verificare che la bozza venga ricaricata correttamente.
- **Verifica Modifica Relazione**:
  - Andare in Archivio, selezionare una relazione modificabile, cliccare su "Apri e modifica" e verificare la navigazione a `/nuova?relazioneId=ID`.
  - Verificare che il refresh della pagina ripristini correttamente la sessione di modifica.
- **Verifica Generazione**:
  - Completare il wizard e generare una relazione. Verificare la navigazione a `/risultato` e la corretta visualizzazione dell'anteprima e delle opzioni di export/salvataggio.
