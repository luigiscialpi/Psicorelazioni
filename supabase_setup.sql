-- ============================================================
-- PsicoRelazioni — Setup database Supabase
-- Esegui questo script in Supabase > SQL Editor
-- ============================================================

-- 1. Tabella pazienti — dati anagrafici REALI.
-- Protetti solo da autenticazione + Row Level Security (nessuna
-- cifratura applicativa in questa fase). Il "codice" resta come
-- riferimento interno facoltativo, non è più la chiave identificativa.
CREATE TABLE IF NOT EXISTS pazienti (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT now(),
  nome                TEXT,
  cognome             TEXT,
  data_nascita        DATE,
  scuola_classe       TEXT,
  codice              TEXT,   -- riferimento interno facoltativo, non più univoco/obbligatorio
  eta_approssimativa  INTEGER,
  sesso               TEXT,
  tipo_consulto       TEXT,
  note_generali       TEXT
);

-- 2. Tabella relazioni
CREATE TABLE IF NOT EXISTS relazioni (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(), -- aggiornato ad ogni modifica post-generazione
  tipo                  TEXT NOT NULL DEFAULT 'importata',  -- 'importata' | 'generata'
  tipo_relazione        TEXT,   -- 'iniziale','follow-up','diagnostica','legale','scolastica','altro'
  paziente_id           UUID REFERENCES pazienti(id) ON DELETE SET NULL,
  testo_markdown        TEXT NOT NULL,
  testo_originale_path  TEXT,
  titolo                TEXT,
  note_interne          TEXT,
  anno                  INTEGER,
  tag                   TEXT[],
  wizard_snapshot        JSONB   -- risposte complete del wizard (sezioni, punteggi, checkbox...)
                                  -- SENZA anagrafica, che vive solo in pazienti.
                                  -- Permette di riaprire e continuare a modificare
                                  -- una relazione già generata senza ripartire da zero.
);

-- 3. Tabella profilo_stile (singolo record)
CREATE TABLE IF NOT EXISTS profilo_stile (
  id                       INTEGER PRIMARY KEY DEFAULT 1,
  updated_at               TIMESTAMPTZ DEFAULT now(), -- usato per l'analisi incrementale:
                                                      -- le relazioni con created_at > updated_at
                                                      -- sono "nuove" rispetto all'ultimo profilo
  documento_stile          TEXT,
  versione                 INTEGER DEFAULT 1,
  num_relazioni_analizzate INTEGER DEFAULT 0,
  note_manuali             TEXT,
  template_rilevati        JSONB DEFAULT '[]'         -- suggerimenti rilevati da Gemini dal profilo;
                                                      -- azzerati automaticamente quando il profilo
                                                      -- viene rigenerato o modificato manualmente
);

-- 4. Tabella sessioni_wizard
CREATE TABLE IF NOT EXISTS sessioni_wizard (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT now(),
  stato               TEXT DEFAULT 'in_corso',  -- 'in_corso' | 'completata' | 'esportata'
  risposte_wizard     JSONB,
  bozza_generata      TEXT,
  relazione_finale_id UUID REFERENCES relazioni(id) ON DELETE SET NULL
);

-- 5. Tabella professionista (singolo record)
CREATE TABLE IF NOT EXISTS professionista (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  updated_at          TIMESTAMPTZ DEFAULT now(),
  nome_completo       TEXT,
  genere              TEXT,  -- 'uomo' | 'donna' | 'non_binario'
  titolo              TEXT,
  specializzazione    TEXT,
  email               TEXT,
  telefono            TEXT,
  indirizzo           TEXT,
  citta               TEXT,
  partita_iva         TEXT,
  codice_fiscale      TEXT
);

-- Migrazione compatibile per istanze già esistenti
ALTER TABLE professionista ADD COLUMN IF NOT EXISTS genere TEXT;
ALTER TABLE profilo_stile  ADD COLUMN IF NOT EXISTS template_rilevati JSONB DEFAULT '[]';

-- ============================================================
-- Row Level Security: solo l'utente autenticato vede i suoi dati
-- ============================================================

ALTER TABLE pazienti        ENABLE ROW LEVEL SECURITY;
ALTER TABLE relazioni       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profilo_stile   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessioni_wizard ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionista  ENABLE ROW LEVEL SECURITY;

-- Policy: accesso solo per utenti autenticati (utente singola)
CREATE POLICY "Accesso autenticato" ON pazienti        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Accesso autenticato" ON relazioni       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Accesso autenticato" ON profilo_stile   FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Accesso autenticato" ON sessioni_wizard FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Accesso autenticato" ON professionista  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- Storage buckets (esegui separatamente da Supabase > Storage)
-- ============================================================
-- Crea manualmente questi 2 bucket in Supabase > Storage:
--   • docx-originali   (privato)
--   • export-docx      (privato)
