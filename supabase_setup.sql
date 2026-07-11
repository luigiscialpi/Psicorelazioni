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
  codice              TEXT,
  eta_approssimativa  INTEGER,
  sesso               TEXT,
  tipo_consulto       TEXT,
  note_generali       TEXT,
  owner_id            UUID NOT NULL DEFAULT auth.uid()
);

-- 2. Tabella relazioni
CREATE TABLE IF NOT EXISTS relazioni (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  tipo                  TEXT NOT NULL DEFAULT 'importata',
  tipo_relazione        TEXT,
  paziente_id           UUID REFERENCES pazienti(id) ON DELETE SET NULL,
  testo_markdown        TEXT NOT NULL,
  testo_originale_path  TEXT,
  titolo                TEXT,
  note_interne          TEXT,
  anno                  INTEGER,
  tag                   TEXT[],
  wizard_snapshot        JSONB,
  owner_id              UUID NOT NULL DEFAULT auth.uid()
);

-- 3. Tabella profilo_stile (singolo record per utente)
CREATE TABLE IF NOT EXISTS profilo_stile (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                 UUID NOT NULL UNIQUE DEFAULT auth.uid(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  documento_stile          TEXT,
  versione                 INTEGER DEFAULT 1,
  num_relazioni_analizzate INTEGER DEFAULT 0,
  note_manuali             TEXT,
  template_rilevati        JSONB DEFAULT '[]'
);

-- 4. Tabella sessioni_wizard
CREATE TABLE IF NOT EXISTS sessioni_wizard (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT now(),
  owner_id            UUID NOT NULL DEFAULT auth.uid(),
  stato               TEXT DEFAULT 'in_corso',
  risposte_wizard     JSONB,
  bozza_generata      TEXT,
  relazione_finale_id UUID REFERENCES relazioni(id) ON DELETE SET NULL
);

-- 5. Tabella professionista (singolo record per utente)
CREATE TABLE IF NOT EXISTS professionista (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL UNIQUE DEFAULT auth.uid(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  nome_completo       TEXT,
  genere              TEXT,
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

-- Isolamento per-utente: aggiungi colonne nullable, poi popola, poi vincola
ALTER TABLE pazienti        ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE relazioni       ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE sessioni_wizard ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE profilo_stile   ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE professionista  ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE test_templates  ADD COLUMN IF NOT EXISTS owner_id UUID;

UPDATE pazienti        SET owner_id = COALESCE((SELECT auth.uid()), gen_random_uuid()) WHERE owner_id IS NULL;
UPDATE relazioni       SET owner_id = COALESCE((SELECT auth.uid()), gen_random_uuid()) WHERE owner_id IS NULL;
UPDATE sessioni_wizard SET owner_id = COALESCE((SELECT auth.uid()), gen_random_uuid()) WHERE owner_id IS NULL;
UPDATE profilo_stile   SET owner_id = COALESCE((SELECT auth.uid()), gen_random_uuid()) WHERE owner_id IS NULL;
UPDATE professionista  SET owner_id = COALESCE((SELECT auth.uid()), gen_random_uuid()) WHERE owner_id IS NULL;
UPDATE test_templates  SET owner_id = COALESCE((SELECT auth.uid()), gen_random_uuid()) WHERE owner_id IS NULL AND built_in = false;

ALTER TABLE pazienti        ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE relazioni       ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE sessioni_wizard ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE profilo_stile   ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE professionista  ALTER COLUMN owner_id SET NOT NULL;

ALTER TABLE pazienti        ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE relazioni       ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE sessioni_wizard ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE profilo_stile   ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE professionista  ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE test_templates  ALTER COLUMN owner_id SET DEFAULT auth.uid();

ALTER TABLE profilo_stile   ADD CONSTRAINT IF NOT EXISTS profilo_stile_owner_id_key UNIQUE (owner_id);
ALTER TABLE professionista  ADD CONSTRAINT IF NOT EXISTS professionista_owner_id_key UNIQUE (owner_id);

-- 6. Tabella test_templates
CREATE TABLE IF NOT EXISTS test_templates (
  id                            TEXT PRIMARY KEY,
  nome                          TEXT NOT NULL,
  categoria                     TEXT NOT NULL,
  scala_default                 JSONB NOT NULL,
  campi_principali               JSONB NOT NULL,
  gruppi_secondari               JSONB,
  nota_range                    TEXT,
  colonne                       JSONB DEFAULT '["Punteggio"]',
  formule                       JSONB,
  richiede_eta_valutazione       BOOLEAN NOT NULL DEFAULT false,
  richiede_strumenti_utilizzati  BOOLEAN NOT NULL DEFAULT false,
  built_in                      BOOLEAN NOT NULL DEFAULT false,
  attivo                        BOOLEAN NOT NULL DEFAULT true,
  schema_version                 INTEGER NOT NULL DEFAULT 1,
  created_at                    TIMESTAMPTZ DEFAULT now(),
  updated_at                    TIMESTAMPTZ DEFAULT now(),
  owner_id                      UUID
);

ALTER TABLE test_templates ENABLE ROW LEVEL SECURITY;

-- Policy granulari: built-in visibili a tutti, custom isolati per utente
CREATE POLICY "Utenti autenticati possono leggere test_templates" ON test_templates
  FOR SELECT TO authenticated USING (built_in = true OR auth.uid() = owner_id);
CREATE POLICY "Utenti autenticati possono creare test_templates custom" ON test_templates
  FOR INSERT TO authenticated WITH CHECK (built_in = false AND auth.uid() = owner_id);
CREATE POLICY "Utenti autenticati possono aggiornare test_templates custom" ON test_templates
  FOR UPDATE TO authenticated USING (built_in = false AND auth.uid() = owner_id);
CREATE POLICY "Utenti autenticati possono eliminare test_templates custom" ON test_templates
  FOR DELETE TO authenticated USING (built_in = false AND auth.uid() = owner_id);

-- Seed: i due test built-in, nello stesso formato TestTemplate usato dal codice.
INSERT INTO test_templates (id, nome, categoria, scala_default, campi_principali, gruppi_secondari, nota_range, richiede_eta_valutazione, richiede_strumenti_utilizzati, built_in, attivo, schema_version)
VALUES ('wisc-iv', 'WISC-IV', 'cognitivo', '{"tipo":"qi_wisc"}', '[{"key":"icv","label":"Comprensione Verbale (ICV)","descr":"L''Indice di Comprensione Verbale (ICV) offre una misura della formazione di concetti verbali, del ragionamento e della conoscenza acquisita dall''ambiente."},{"key":"rp","label":"Ragionamento Visuo-Percettivo (RP)","descr":"L''Indice di Ragionamento Visuo-Percettivo (RP) offre una misura del ragionamento fluido nel dominio percettivo, con particolare attenzione all''elaborazione simultanea dell''informazione visuo-spaziale."},{"key":"iml","label":"Memoria di Lavoro (IML)","descr":"L''Indice di Memoria di Lavoro (IML) offre una misura della capacità di mantenere temporaneamente le informazioni in memoria, eseguire operazioni mentali su di esse e produrre un risultato."},{"key":"ve","label":"Velocità di Elaborazione (VE)","descr":"L''Indice di Velocità di Elaborazione (VE) offre una misura della velocità e accuratezza nell''elaborazione dell''informazione visiva semplice o routinaria."},{"key":"qit","label":"Totale (QI)","descr":"Il Quoziente Intellettivo Totale (QIT) rappresenta una stima globale del funzionamento cognitivo, derivata dall''integrazione dei quattro indici principali."},{"key":"iag","label":"Indice di Abilità Generale (IAG)","descr":"L''Indice di Abilità Generale (IAG) offre una misura del funzionamento cognitivo generale meno sensibile alle componenti di memoria di lavoro e velocità di elaborazione."},{"key":"icc","label":"Indice di Efficienza Cognitiva (ICC)","descr":"L''Indice di Efficienza Cognitiva (ICC) offre una misura dell''efficienza con cui il soggetto elabora le informazioni, integrando memoria di lavoro e velocità di elaborazione."}]', '[{"key":"icv","label":"Comprensione Verbale (ICV)","scalaDefault":{"tipo":"scalare"},"campi":[{"key":"so","label":"Somiglianze (SO)"},{"key":"vc","label":"Vocabolario (VC)"},{"key":"co","label":"Comprensione (CO)"}]},{"key":"rp","label":"Ragionamento Visuo-Percettivo (RP)","scalaDefault":{"tipo":"scalare"},"campi":[{"key":"dc","label":"Disegno con i Cubi (DC)"},{"key":"ci","label":"Concetti Illustrati (CI)"},{"key":"rm","label":"Ragionamento con le Matrici (RM)"}]},{"key":"iml","label":"Memoria di Lavoro (IML)","scalaDefault":{"tipo":"scalare"},"campi":[{"key":"mc","label":"Memoria di Cifre (MC)"},{"key":"rln","label":"Riordinamento di Lettere e Numeri (RLN)"},{"key":"ar","label":"Aritmetica (AR) — supplementare"}]},{"key":"ve","label":"Velocità di Elaborazione (VE)","scalaDefault":{"tipo":"scalare"},"campi":[{"key":"cf","label":"Cifrario (CF)"},{"key":"rs","label":"Ricerca di Simboli (RS)"},{"key":"ca","label":"Cancellazione (CA) — supplementare"}]}]', '*WISC-IV: QI >129 molto superiore, 120-129 superiore, 110-119 medio-superiore, 90-109 media, 80-89 media inferiore, 70-79 inferiore alla media, <69 molto inferiore alla norma.*', true, true, true, true, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO test_templates (id, nome, categoria, scala_default, campi_principali, gruppi_secondari, nota_range, richiede_eta_valutazione, richiede_strumenti_utilizzati, built_in, attivo, schema_version)
VALUES ('nepsy-ii', 'NEPSY-II', 'nepsy', '{"tipo":"scalare"}', '[{"key":"attenzione_uditiva","label":"Attenzione Uditiva (Attenzione e Funzioni Esecutive)"},{"key":"risposte_associate","label":"Risposte Associate (Attenzione e Funzioni Esecutive)"},{"key":"inibizione","label":"Inibizione (Attenzione e Funzioni Esecutive)"},{"key":"fluenza_disegno","label":"Fluenza nel Disegno (Attenzione e Funzioni Esecutive)"},{"key":"memoria_facce","label":"Memoria di Facce (Memoria e Apprendimento)"},{"key":"memoria_narrativa","label":"Memoria Narrativa (Memoria e Apprendimento)"},{"key":"liste_parole","label":"Apprendimento di Liste di Parole (Memoria e Apprendimento)"},{"key":"denominazione","label":"Denominazione Rapida Automatizzata (Linguaggio)"},{"key":"comprensione_istr","label":"Comprensione di Istruzioni (Linguaggio)"},{"key":"fluenza_fonemica","label":"Fluenza Fonemica (Linguaggio)"},{"key":"riconoscimento_emozioni","label":"Riconoscimento delle Emozioni (Percezione Sociale)"},{"key":"teoria_mente","label":"Teoria della Mente (ToM) (Percezione Sociale)"},{"key":"copia_figure","label":"Copia di Figure (Visuospaziale)"},{"key":"orientamento_linee","label":"Giudizio di Orientamento delle Linee (Visuospaziale)"}]', NULL, '*NEPSY-II: punteggi scalari con media 10 e DS 3; valori più alti indicano prestazioni migliori. Interpretazione contestualizzata al dominio valutato.*', false, true, true, true, 1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Row Level Security: isolamento per-utente (owner_id)
-- ============================================================

ALTER TABLE pazienti        ENABLE ROW LEVEL SECURITY;
ALTER TABLE relazioni       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profilo_stile   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessioni_wizard ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionista  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Isolamento per owner_id" ON pazienti        FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Isolamento per owner_id" ON relazioni       FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Isolamento per owner_id" ON profilo_stile   FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Isolamento per owner_id" ON sessioni_wizard FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Isolamento per owner_id" ON professionista  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- Storage buckets (esegui separatamente da Supabase > Storage)
-- ============================================================
-- Crea manualmente questi 2 bucket in Supabase > Storage:
--   • docx-originali   (privato)
--   • export-docx      (privato)
