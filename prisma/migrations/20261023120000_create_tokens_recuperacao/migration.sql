-- PB-053: tokens de recuperação de senha de uso único (WBS pág. 18).
-- Convenções combinadas com PB-002/PB-003:
--   * token_hash: SHA-256 hexadecimal do token do link; o token bruto existe só na composição do e-mail;
--   * validade de no máximo 15 minutos a partir da criação (padrão: exatamente 15 minutos);
--   * no máximo um token ativo por usuário: ao emitir um novo, a PB-002 deve preencher invalidado_em
--     dos anteriores na mesma transação;
--   * consumo (consumido_em) e invalidação (invalidado_em) são estados finais e não podem ser desfeitos.

CREATE TABLE tokens_recuperacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id UUID NOT NULL,
    token_hash TEXT NOT NULL,
    expira_em TIMESTAMPTZ(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
    consumido_em TIMESTAMPTZ(6),
    invalidado_em TIMESTAMPTZ(6),
    CONSTRAINT tokens_recuperacao_usuario_id_fkey
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tokens_recuperacao_token_hash_unico UNIQUE (token_hash),
    CONSTRAINT tokens_recuperacao_token_hash_sha256
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT tokens_recuperacao_expiracao_15_minutos
        CHECK (expira_em > criado_em AND expira_em <= criado_em + INTERVAL '15 minutes'),
    CONSTRAINT tokens_recuperacao_consumo_no_prazo
        CHECK (consumido_em IS NULL OR (consumido_em >= criado_em AND consumido_em <= expira_em)),
    CONSTRAINT tokens_recuperacao_invalidacao_valida
        CHECK (invalidado_em IS NULL OR invalidado_em >= criado_em),
    CONSTRAINT tokens_recuperacao_estado_final_unico
        CHECK (consumido_em IS NULL OR invalidado_em IS NULL)
);

CREATE INDEX tokens_recuperacao_usuario_expira_em_idx
    ON tokens_recuperacao (usuario_id, expira_em);

-- Apenas um token pendente (nem consumido nem invalidado) por usuário.
CREATE UNIQUE INDEX tokens_recuperacao_um_ativo_por_usuario
    ON tokens_recuperacao (usuario_id)
    WHERE consumido_em IS NULL AND invalidado_em IS NULL;

COMMENT ON COLUMN tokens_recuperacao.token_hash IS
    'SHA-256 hexadecimal do token do link; nunca o token bruto.';
COMMENT ON COLUMN tokens_recuperacao.expira_em IS
    'No máximo 15 minutos após criado_em.';

CREATE FUNCTION proteger_tokens_recuperacao()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.consumido_em IS NOT NULL OR OLD.invalidado_em IS NOT NULL THEN
        RAISE EXCEPTION 'Token de recuperação já consumido ou invalidado não pode ser alterado.'
            USING ERRCODE = '55000';
    END IF;

    IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
        OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
        OR NEW.criado_em IS DISTINCT FROM OLD.criado_em
        OR NEW.expira_em IS DISTINCT FROM OLD.expira_em THEN
        RAISE EXCEPTION 'Somente consumido_em ou invalidado_em podem ser preenchidos no token de recuperação.'
            USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tokens_recuperacao_proteger
    BEFORE UPDATE ON tokens_recuperacao
    FOR EACH ROW
    EXECUTE FUNCTION proteger_tokens_recuperacao();
