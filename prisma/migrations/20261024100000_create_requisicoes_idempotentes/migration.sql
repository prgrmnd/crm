-- PB-071: deduplicação transacional de comandos da API.
CREATE TABLE requisicoes_idempotentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id UUID NOT NULL,
    operacao VARCHAR(100) NOT NULL,
    chave UUID NOT NULL,
    hash_requisicao CHAR(64) NOT NULL,
    estado VARCHAR(15) NOT NULL,
    recurso_id UUID,
    resposta JSONB,
    expira_em TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT requisicoes_idempotentes_usuario_id_fkey
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT requisicoes_idempotentes_usuario_operacao_chave_unico
        UNIQUE (usuario_id, operacao, chave),
    CONSTRAINT requisicoes_idempotentes_hash_sha256
        CHECK (hash_requisicao ~ '^[0-9a-f]{64}$'),
    CONSTRAINT requisicoes_idempotentes_estado_valido
        CHECK (estado IN ('processando', 'concluida', 'falha')),
    CONSTRAINT requisicoes_idempotentes_expiracao_valida
        CHECK (expira_em > criado_em),
    CONSTRAINT requisicoes_idempotentes_resposta_concluida
        CHECK (estado = 'processando' OR resposta IS NOT NULL)
);

CREATE INDEX requisicoes_idempotentes_expira_em_idx
    ON requisicoes_idempotentes (expira_em);

COMMENT ON COLUMN requisicoes_idempotentes.hash_requisicao IS
    'SHA-256 hexadecimal do payload original; impede reutilizar a chave com outro conteúdo.';
COMMENT ON COLUMN requisicoes_idempotentes.resposta IS
    'Envelope JSON da resposta HTTP serializável, sem headers de autenticação.';
