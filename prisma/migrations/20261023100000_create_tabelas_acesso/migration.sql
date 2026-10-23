-- PB-052: usuários, sessões revogáveis e tentativas de login (WBS págs. 16-18).
-- Convenções de credenciais combinadas com a PB-001:
--   * senha_hash: string PHC do argon2id (algoritmo, parâmetros e sal embutidos);
--   * sessoes.token_hash e tentativas_login.identificador_hash: SHA-256 em hexadecimal minúsculo
--     (o identificador é o hash de lower(trim(email)) tentado).
-- As constraints de formato impedem gravar senha ou token bruto por engano.

CREATE FUNCTION definir_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.atualizado_em := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    senha_hash TEXT NOT NULL,
    perfil VARCHAR(20) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    senha_alterada_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    criado_por UUID,
    atualizado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    versao INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT usuarios_criado_por_fkey
        FOREIGN KEY (criado_por) REFERENCES usuarios (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT usuarios_nome_nao_vazio
        CHECK (length(trim(nome)) > 0),
    CONSTRAINT usuarios_email_formato
        CHECK (trim(email) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    CONSTRAINT usuarios_senha_hash_argon2id
        CHECK (senha_hash ~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]{11,}\$[A-Za-z0-9+/]{16,}$'),
    CONSTRAINT usuarios_perfil_valido
        CHECK (perfil IN ('administrador', 'operador_captacao')),
    CONSTRAINT usuarios_versao_positiva
        CHECK (versao > 0)
);

-- E-mail único sem diferenciar maiúsculas nem espaços nas bordas.
CREATE UNIQUE INDEX usuarios_email_normalizado_unico
    ON usuarios (lower(trim(email)));

CREATE INDEX usuarios_criado_por_idx
    ON usuarios (criado_por);

COMMENT ON COLUMN usuarios.criado_por IS
    'Opcional apenas no bootstrap do primeiro administrador.';
COMMENT ON COLUMN usuarios.senha_hash IS
    'String PHC argon2id; nunca senha reversível.';

CREATE TRIGGER usuarios_definir_atualizado_em
    BEFORE UPDATE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION definir_atualizado_em();

CREATE TABLE sessoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id UUID NOT NULL,
    token_hash TEXT NOT NULL,
    ultimo_acesso_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em TIMESTAMPTZ(6) NOT NULL,
    revogada_em TIMESTAMPTZ(6),
    ip INET,
    agente_usuario TEXT,
    CONSTRAINT sessoes_usuario_id_fkey
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT sessoes_token_hash_unico UNIQUE (token_hash),
    CONSTRAINT sessoes_token_hash_sha256
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT sessoes_expira_apos_criacao
        CHECK (expira_em > criado_em),
    CONSTRAINT sessoes_ultimo_acesso_valido
        CHECK (ultimo_acesso_em >= criado_em),
    CONSTRAINT sessoes_revogacao_valida
        CHECK (revogada_em IS NULL OR revogada_em >= criado_em)
);

CREATE INDEX sessoes_usuario_id_idx
    ON sessoes (usuario_id);

CREATE INDEX sessoes_expira_em_idx
    ON sessoes (expira_em);

COMMENT ON COLUMN sessoes.token_hash IS
    'SHA-256 hexadecimal do identificador enviado ao navegador; nunca o token bruto.';

CREATE TABLE tentativas_login (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id UUID,
    identificador_hash TEXT NOT NULL,
    ip INET,
    sucesso BOOLEAN NOT NULL,
    bloqueado_ate TIMESTAMPTZ(6),
    CONSTRAINT tentativas_login_usuario_id_fkey
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT tentativas_login_identificador_sha256
        CHECK (identificador_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT tentativas_login_bloqueio_valido
        CHECK (bloqueado_ate IS NULL OR bloqueado_ate > criado_em),
    CONSTRAINT tentativas_login_sucesso_sem_bloqueio
        CHECK (NOT (sucesso AND bloqueado_ate IS NOT NULL))
);

CREATE INDEX tentativas_login_identificador_criado_em_idx
    ON tentativas_login (identificador_hash, criado_em);

CREATE INDEX tentativas_login_ip_criado_em_idx
    ON tentativas_login (ip, criado_em);

CREATE INDEX tentativas_login_usuario_id_idx
    ON tentativas_login (usuario_id);

COMMENT ON COLUMN tentativas_login.usuario_id IS
    'Nulo quando a conta tentada não existe.';
COMMENT ON COLUMN tentativas_login.identificador_hash IS
    'SHA-256 hexadecimal de lower(trim(email)) tentado.';
