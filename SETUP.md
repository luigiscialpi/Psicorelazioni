# Setup PsicoRelazioni

## 1. Supabase

1. Vai su [supabase.com](https://supabase.com) e crea un nuovo progetto
2. Vai in **SQL Editor** e incolla + esegui tutto il contenuto di `supabase_setup.sql`
3. Vai in **Storage** e crea due bucket privati:
   - `docx-originali`
   - `export-docx`
4. Vai in **Project Settings → API** e copia:
   - **Project URL**
   - **anon public key**

## 2. Variabili d'ambiente

Crea un file `.env.local` nella cartella del progetto:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

## 3. Crea l'account utente

In Supabase → **Authentication → Users** → **Add user**:
- Inserisci email e password di tua sorella
- Nessuna conferma email richiesta (disabilita in Authentication → Settings)

## 4. Avvio locale

```bash
npm install
```

**Nota tecnica — worker PDF**: l'import dei file `.pdf` usa `pdf.js`, che richiede un file "worker" servito come asset statico. È già incluso in `public/pdf.worker.min.mjs`, ma se in futuro aggiorni la dipendenza `pdfjs-dist`, ricordati di ricopiarlo:
```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
```

```bash
npm run dev
```

Apri http://localhost:5173

## 5. Deploy su Vercel (opzionale, per accesso da smartphone)

1. Installa Vercel CLI: `npm i -g vercel`
2. Nella cartella del progetto: `vercel`
3. Aggiungi le variabili d'ambiente nel pannello Vercel
4. L'app sarà disponibile su un URL HTTPS utilizzabile da smartphone

## Stato sviluppo

- [x] Modulo 1 — Auth + Import DOCX
- [ ] Modulo 2 — Profilo di stile (Gemini)
- [ ] Modulo 3 — Wizard nuova relazione
- [ ] Modulo 4 — Generazione + editor
- [ ] Modulo 5 — Export DOCX + archivio
