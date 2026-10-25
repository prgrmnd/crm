-- PB-055: tabelas de domínio de origens, etapas e motivos, com carga oficial (WBS págs. 19-20).
-- Os valores são referência estática do protótipo: não há editor dinâmico de etapas.
-- A carga usa ON CONFLICT (codigo) DO NOTHING para ser idempotente.

CREATE TABLE origens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    codigo VARCHAR(30) NOT NULL,
    nome VARCHAR(80) NOT NULL,
    classificacao_fixa VARCHAR(10),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT origens_codigo_unico UNIQUE (codigo),
    CONSTRAINT origens_codigo_formato
        CHECK (codigo ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT origens_nome_nao_vazio
        CHECK (length(trim(nome)) > 0),
    CONSTRAINT origens_classificacao_fixa_valida
        CHECK (classificacao_fixa IS NULL OR classificacao_fixa = 'inbound')
);

COMMENT ON COLUMN origens.classificacao_fixa IS
    'inbound para Site/Instagram; nulo permite seleção manual. Validação no contato fica com a PB-057.';

CREATE TABLE etapas_captacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    codigo VARCHAR(40) NOT NULL,
    nome VARCHAR(120) NOT NULL,
    ordem SMALLINT NOT NULL,
    CONSTRAINT etapas_captacao_codigo_unico UNIQUE (codigo),
    CONSTRAINT etapas_captacao_ordem_unica UNIQUE (ordem),
    CONSTRAINT etapas_captacao_codigo_formato
        CHECK (codigo ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT etapas_captacao_nome_nao_vazio
        CHECK (length(trim(nome)) > 0),
    -- Ordem única entre 1 e 4: o funil principal não comporta etapas extras.
    CONSTRAINT etapas_captacao_ordem_valida
        CHECK (ordem BETWEEN 1 AND 4)
);

CREATE TABLE etapas_perda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    codigo VARCHAR(40) NOT NULL,
    nome VARCHAR(120) NOT NULL,
    ordem SMALLINT NOT NULL,
    exige_agendamento BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT etapas_perda_codigo_unico UNIQUE (codigo),
    CONSTRAINT etapas_perda_ordem_unica UNIQUE (ordem),
    CONSTRAINT etapas_perda_codigo_formato
        CHECK (codigo ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT etapas_perda_nome_nao_vazio
        CHECK (length(trim(nome)) > 0),
    -- Ordem única entre 1 e 5: o funil de perdas não comporta etapas extras.
    CONSTRAINT etapas_perda_ordem_valida
        CHECK (ordem BETWEEN 1 AND 5)
);

CREATE TABLE motivos_perda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    codigo VARCHAR(40) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    exige_observacao BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT motivos_perda_codigo_unico UNIQUE (codigo),
    CONSTRAINT motivos_perda_codigo_formato
        CHECK (codigo ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT motivos_perda_nome_nao_vazio
        CHECK (length(trim(nome)) > 0)
);

-- Códigos são estáveis e linhas de domínio não são apagadas (preservam referências históricas).
CREATE FUNCTION proteger_tabela_dominio()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Linhas de % são referência estática e não podem ser removidas.', TG_TABLE_NAME
            USING ERRCODE = '55000';
    END IF;

    IF NEW.codigo IS DISTINCT FROM OLD.codigo THEN
        RAISE EXCEPTION 'O código de % é estável e não pode ser alterado.', TG_TABLE_NAME
            USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER origens_proteger_dominio
    BEFORE UPDATE OR DELETE ON origens
    FOR EACH ROW EXECUTE FUNCTION proteger_tabela_dominio();

CREATE TRIGGER etapas_captacao_proteger_dominio
    BEFORE UPDATE OR DELETE ON etapas_captacao
    FOR EACH ROW EXECUTE FUNCTION proteger_tabela_dominio();

CREATE TRIGGER etapas_perda_proteger_dominio
    BEFORE UPDATE OR DELETE ON etapas_perda
    FOR EACH ROW EXECUTE FUNCTION proteger_tabela_dominio();

CREATE TRIGGER motivos_perda_proteger_dominio
    BEFORE UPDATE OR DELETE ON motivos_perda
    FOR EACH ROW EXECUTE FUNCTION proteger_tabela_dominio();

-- Carga oficial (rótulos idênticos ao protótipo em src/lib/domain.cjs).
INSERT INTO origens (codigo, nome, classificacao_fixa) VALUES
    ('instagram', 'Instagram', 'inbound'),
    ('site', 'Site', 'inbound'),
    ('indicacao', 'Indicação', NULL),
    ('email', 'E-mail', NULL),
    ('evento', 'Evento', NULL),
    ('whatsapp', 'WhatsApp', NULL)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO etapas_captacao (codigo, nome, ordem) VALUES
    ('aprendizado_descoberta', 'Aprendizado e descoberta', 1),
    ('reconhecimento_problema', 'Reconhecimento do problema', 2),
    ('consideracao_solucao', 'Consideração da solução', 3),
    ('decisao_doacao', 'Decisão de doação', 4)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO etapas_perda (codigo, nome, ordem, exige_agendamento) VALUES
    ('perda_registrada', 'Perda registrada', 1, FALSE),
    ('em_analise', 'Em análise', 2, FALSE),
    ('retomada_agendada', 'Retomada agendada', 3, TRUE),
    ('em_reaproximacao', 'Em reaproximação', 4, FALSE),
    ('encerrado_sem_retomada', 'Encerrado sem retomada', 5, FALSE)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO motivos_perda (codigo, nome, exige_observacao) VALUES
    ('sem_interesse', 'Sem interesse', FALSE),
    ('sem_disponibilidade_financeira', 'Sem disponibilidade financeira', FALSE),
    ('sem_retorno', 'Sem retorno', FALSE),
    ('momento_inadequado', 'Momento inadequado', FALSE),
    ('outros', 'Outros', TRUE)
ON CONFLICT (codigo) DO NOTHING;
