-- Tabella per i template dei test dinamici
CREATE TABLE IF NOT EXISTS test_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  scala_default JSONB NOT NULL,
  campi_principali JSONB NOT NULL,
  gruppi_secondari JSONB,
  nota_range TEXT,
  richiede_eta_valutazione BOOLEAN DEFAULT false,
  richiede_strumenti_utilizzati BOOLEAN DEFAULT false,
  built_in BOOLEAN DEFAULT false,
  attivo BOOLEAN DEFAULT true,
  schema_version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- RLS
ALTER TABLE test_templates ENABLE ROW LEVEL SECURITY;

-- Tutti gli utenti autenticati possono leggere i test templates
CREATE POLICY "Utenti autenticati possono leggere test_templates" 
ON test_templates FOR SELECT 
TO authenticated 
USING (true);

-- Solo in locale/demo/admin si dovrebbe poter scrivere (per ora chiunque autenticato può crearli)
-- Nel dubbio, un utente può creare custom template
CREATE POLICY "Utenti autenticati possono creare test_templates custom" 
ON test_templates FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Utenti autenticati possono aggiornare test_templates" 
ON test_templates FOR UPDATE 
TO authenticated 
USING (true);
