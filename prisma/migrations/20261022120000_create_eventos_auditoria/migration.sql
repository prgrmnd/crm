CREATE TABLE eventos_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ator_tipo VARCHAR(10) NOT NULL,
    ator_id UUID,
    contato_id UUID,
    acao VARCHAR(100) NOT NULL,
    entidade_tipo VARCHAR(80) NOT NULL,
    entidade_id UUID,
    antes JSONB,
    depois JSONB,
    motivo TEXT,
    correlacao_id UUID NOT NULL,
    CONSTRAINT eventos_auditoria_ator_tipo_valido
        CHECK (ator_tipo IN ('usuario', 'sistema')),
    CONSTRAINT eventos_auditoria_ator_id_compativel
        CHECK ((ator_tipo = 'usuario' AND ator_id IS NOT NULL)
            OR (ator_tipo = 'sistema' AND ator_id IS NULL)),
    CONSTRAINT eventos_auditoria_acao_nao_vazia
        CHECK (length(trim(acao)) > 0),
    CONSTRAINT eventos_auditoria_entidade_nao_vazia
        CHECK (length(trim(entidade_tipo)) > 0)
);

COMMENT ON COLUMN eventos_auditoria.ator_id IS
    'FK to usuarios.id; add the constraint when PB-052 creates usuarios.';
COMMENT ON COLUMN eventos_auditoria.contato_id IS
    'FK to contatos.id; add the constraint when PB-057 creates contatos.';

CREATE INDEX eventos_auditoria_contato_timeline_idx
    ON eventos_auditoria (contato_id, criado_em DESC);

CREATE INDEX eventos_auditoria_correlacao_idx
    ON eventos_auditoria (correlacao_id);

CREATE FUNCTION eventos_auditoria_contem_dado_sensivel(valor JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    item RECORD;
BEGIN
    IF valor IS NULL THEN
        RETURN FALSE;
    ELSIF jsonb_typeof(valor) = 'object' THEN
        FOR item IN SELECT key, value FROM jsonb_each(valor) LOOP
            IF item.key ~* '(senha|password|credential|credencial|token|secret|segredo|salt|hash|authorization|cookie)' THEN
                RETURN TRUE;
            END IF;
            IF eventos_auditoria_contem_dado_sensivel(item.value) THEN
                RETURN TRUE;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(valor) = 'array' THEN
        FOR item IN SELECT value FROM jsonb_array_elements(valor) LOOP
            IF eventos_auditoria_contem_dado_sensivel(item.value) THEN
                RETURN TRUE;
            END IF;
        END LOOP;
    END IF;

    RETURN FALSE;
END;
$$;

ALTER TABLE eventos_auditoria
    ADD CONSTRAINT eventos_auditoria_antes_sanitizado
        CHECK (antes IS NULL OR NOT eventos_auditoria_contem_dado_sensivel(antes)),
    ADD CONSTRAINT eventos_auditoria_depois_sanitizado
        CHECK (depois IS NULL OR NOT eventos_auditoria_contem_dado_sensivel(depois));

CREATE FUNCTION eventos_auditoria_bloquear_mutacao()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'eventos_auditoria é append-only; UPDATE, DELETE e TRUNCATE são proibidos.'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER eventos_auditoria_sem_update_delete
    BEFORE UPDATE OR DELETE ON eventos_auditoria
    FOR EACH ROW
    EXECUTE FUNCTION eventos_auditoria_bloquear_mutacao();

CREATE TRIGGER eventos_auditoria_sem_truncate
    BEFORE TRUNCATE ON eventos_auditoria
    FOR EACH STATEMENT
    EXECUTE FUNCTION eventos_auditoria_bloquear_mutacao();

COMMENT ON TABLE eventos_auditoria IS
    'Registro imutável de eventos do CRM; somente novas linhas podem ser inseridas.';
