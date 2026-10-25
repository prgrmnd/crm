-- PB-057: cadastro central de contatos (WBS, tabela contatos).
-- CPF/CNPJ numéricos, conforme o contrato do WBS e do domínio atual.
CREATE FUNCTION contatos_documento_valido(documento TEXT, tipo_pessoa TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    tamanho INTEGER;
    posicao INTEGER;
    peso INTEGER;
    soma INTEGER;
    digito INTEGER;
BEGIN
    IF tipo_pessoa NOT IN ('PF', 'PJ') OR documento !~ '^[0-9]+$'
       OR documento = repeat(substr(documento, 1, 1), length(documento)) THEN
        RETURN FALSE;
    END IF;
    IF tipo_pessoa = 'PF' THEN
        IF length(documento) <> 11 THEN RETURN FALSE; END IF;
        FOR tamanho IN 9..10 LOOP
            soma := 0;
            FOR posicao IN 1..tamanho LOOP
                soma := soma + substr(documento, posicao, 1)::INTEGER * (tamanho + 2 - posicao);
            END LOOP;
            digito := ((soma * 10) % 11) % 10;
            IF digito <> substr(documento, tamanho + 1, 1)::INTEGER THEN RETURN FALSE; END IF;
        END LOOP;
    ELSE
        IF length(documento) <> 14 THEN RETURN FALSE; END IF;
        FOR tamanho IN 12..13 LOOP
            soma := 0;
            peso := tamanho - 7;
            FOR posicao IN 1..tamanho LOOP
                soma := soma + substr(documento, posicao, 1)::INTEGER * peso;
                peso := CASE WHEN peso = 2 THEN 9 ELSE peso - 1 END;
            END LOOP;
            digito := CASE WHEN soma % 11 < 2 THEN 0 ELSE 11 - soma % 11 END;
            IF digito <> substr(documento, tamanho + 1, 1)::INTEGER THEN RETURN FALSE; END IF;
        END LOOP;
    END IF;
    RETURN TRUE;
END;
$$;

CREATE TABLE contatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tipo_pessoa CHAR(2) NOT NULL,
    nome VARCHAR(180) NOT NULL,
    email VARCHAR(254),
    telefone VARCHAR(11),
    documento VARCHAR(14),
    origem_id UUID NOT NULL,
    classificacao VARCHAR(10) NOT NULL,
    etapa_captacao_id UUID NOT NULL,
    responsavel_id UUID NOT NULL,
    data_cadastro TIMESTAMPTZ(6) NOT NULL,
    criado_por UUID NOT NULL,
    atualizado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    excluido_em TIMESTAMPTZ(6),
    versao INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT contatos_email_unico UNIQUE (email),
    CONSTRAINT contatos_documento_unico UNIQUE (documento),
    CONSTRAINT contatos_tipo_pessoa_valido CHECK (tipo_pessoa IN ('PF', 'PJ')),
    CONSTRAINT contatos_nome_nao_vazio CHECK (length(trim(nome)) > 0),
    CONSTRAINT contatos_meio_comunicacao_obrigatorio CHECK (email IS NOT NULL OR telefone IS NOT NULL),
    CONSTRAINT contatos_email_formato CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    CONSTRAINT contatos_telefone_formato CHECK (telefone IS NULL OR telefone ~ '^[0-9]{10,11}$'),
    CONSTRAINT contatos_documento_valido CHECK (documento IS NULL OR contatos_documento_valido(documento, tipo_pessoa)),
    CONSTRAINT contatos_classificacao_valida CHECK (classificacao IN ('inbound', 'outbound')),
    CONSTRAINT contatos_versao_positiva CHECK (versao > 0),
    CONSTRAINT contatos_origem_id_fkey FOREIGN KEY (origem_id) REFERENCES origens(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT contatos_etapa_captacao_id_fkey FOREIGN KEY (etapa_captacao_id) REFERENCES etapas_captacao(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT contatos_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT contatos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE FUNCTION contatos_preparar_gravacao()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.email := nullif(lower(trim(NEW.email)), '');
    NEW.telefone := nullif(trim(NEW.telefone), '');
    NEW.documento := nullif(trim(NEW.documento), '');

    -- Código imutável no domínio: a regra não depende de rótulos editáveis.
    IF NEW.classificacao = 'outbound' AND EXISTS (
        SELECT 1 FROM origens WHERE id = NEW.origem_id AND codigo IN ('site', 'instagram')
    ) THEN
        RAISE EXCEPTION 'Contatos de origem Site/Instagram devem ser inbound.'
            USING ERRCODE = '23514', CONSTRAINT = 'contatos_origem_classificacao_compativel';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        NEW.atualizado_em := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER contatos_preparar_gravacao
    BEFORE INSERT OR UPDATE ON contatos
    FOR EACH ROW EXECUTE FUNCTION contatos_preparar_gravacao();

CREATE INDEX contatos_responsavel_data_cadastro_idx ON contatos(responsavel_id, data_cadastro);
CREATE INDEX contatos_origem_classificacao_idx ON contatos(origem_id, classificacao);
CREATE INDEX contatos_etapa_captacao_idx ON contatos(etapa_captacao_id);
CREATE INDEX contatos_criado_por_idx ON contatos(criado_por);

COMMENT ON COLUMN contatos.email IS 'Normalizado em lower(trim(email)); vazio vira NULL. Unicidade inclui excluídos.';
COMMENT ON COLUMN contatos.documento IS 'CPF/CNPJ numérico com dígitos verificadores válidos; unicidade inclui excluídos.';
COMMENT ON COLUMN contatos.versao IS 'Controle otimista: atualizações devem filtrar pela versão esperada e incrementá-la atomicamente.';
COMMENT ON COLUMN contatos.excluido_em IS 'Exclusão lógica; bloqueio por histórico financeiro pertence ao fluxo de exclusão (PB-009).';
