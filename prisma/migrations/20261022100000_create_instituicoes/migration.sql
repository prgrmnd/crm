CREATE TABLE instituicoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nome VARCHAR(180) NOT NULL,
    documento VARCHAR(14),
    cidade VARCHAR(100) NOT NULL,
    uf CHAR(2) NOT NULL,
    logo_arquivo_id UUID,
    fuso_horario VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
    email_remetente VARCHAR(254),
    nome_remetente VARCHAR(180),
    atualizado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT instituicoes_documento_unico UNIQUE (documento),
    CONSTRAINT instituicoes_documento_normalizado
        CHECK (documento IS NULL OR documento ~ '^[0-9]{14}$'),
    CONSTRAINT instituicoes_uf_valida
        CHECK (uf ~ '^[A-Z]{2}$'),
    CONSTRAINT instituicoes_nome_nao_vazio
        CHECK (length(trim(nome)) > 0),
    CONSTRAINT instituicoes_cidade_nao_vazia
        CHECK (length(trim(cidade)) > 0),
    CONSTRAINT instituicoes_fuso_nao_vazio
        CHECK (length(trim(fuso_horario)) > 0)
);

-- O índice sobre expressão constante limita a tabela a uma instituição titular.
CREATE UNIQUE INDEX instituicoes_uma_unica_linha
    ON instituicoes ((TRUE));

COMMENT ON COLUMN instituicoes.logo_arquivo_id IS
    'UUID opcional; a FK para arquivos.id será adicionada pela PB-061.';

CREATE FUNCTION atualizar_instituicoes_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_timezone_names WHERE name = NEW.fuso_horario
    ) THEN
        RAISE EXCEPTION 'Fuso horário IANA inválido: %', NEW.fuso_horario
            USING ERRCODE = '22023';
    END IF;

    NEW.atualizado_em := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER instituicoes_validar_e_atualizar
    BEFORE INSERT OR UPDATE ON instituicoes
    FOR EACH ROW
    EXECUTE FUNCTION atualizar_instituicoes_atualizado_em();
