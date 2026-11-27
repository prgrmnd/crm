-- PB-068: Outbox transacional e eventos de domínio (BD Operação).
-- Todo evento de domínio gera, por trigger, sua mensagem na caixa de saída dentro da
-- MESMA transação da regra de negócio: ou os três registros (regra, evento e mensagem)
-- são confirmados juntos no COMMIT, ou nenhum deles persiste.

CREATE TABLE eventos_dominio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Nome no padrão <contexto>.<fato_no_passado>, ex.: captacao.etapa_alterada.
    tipo VARCHAR(100) NOT NULL,
    -- Versão do contrato do payload, para evolução sem quebrar consumidores.
    versao_esquema SMALLINT NOT NULL DEFAULT 1,
    agregado_tipo VARCHAR(80) NOT NULL,
    agregado_id UUID NOT NULL,
    contato_id UUID REFERENCES contatos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ator_tipo VARCHAR(10) NOT NULL,
    ator_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Chave natural opcional do fato; o UNIQUE impede que cliques concorrentes
    -- (ex.: duas confirmações da mesma movimentação na PB-013) publiquem dois eventos.
    chave_deduplicacao VARCHAR(200),
    correlacao_id UUID NOT NULL,
    CONSTRAINT eventos_dominio_tipo_formato
        CHECK (tipo ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT eventos_dominio_versao_esquema_valida
        CHECK (versao_esquema > 0),
    CONSTRAINT eventos_dominio_agregado_nao_vazio
        CHECK (length(trim(agregado_tipo)) > 0),
    CONSTRAINT eventos_dominio_ator_tipo_valido
        CHECK (ator_tipo IN ('usuario', 'sistema')),
    CONSTRAINT eventos_dominio_ator_id_compativel
        CHECK ((ator_tipo = 'usuario' AND ator_id IS NOT NULL)
            OR (ator_tipo = 'sistema' AND ator_id IS NULL)),
    CONSTRAINT eventos_dominio_payload_objeto
        CHECK (jsonb_typeof(payload) = 'object'),
    -- Reaproveita a sanitização recursiva da PB-053: credenciais nunca entram no evento.
    CONSTRAINT eventos_dominio_payload_sanitizado
        CHECK (NOT eventos_auditoria_contem_dado_sensivel(payload)),
    CONSTRAINT eventos_dominio_chave_deduplicacao_nao_vazia
        CHECK (chave_deduplicacao IS NULL OR length(trim(chave_deduplicacao)) > 0),
    CONSTRAINT eventos_dominio_chave_deduplicacao_unica UNIQUE (chave_deduplicacao)
);

CREATE INDEX eventos_dominio_agregado_idx
    ON eventos_dominio (agregado_tipo, agregado_id, criado_em);
CREATE INDEX eventos_dominio_contato_idx
    ON eventos_dominio (contato_id, criado_em DESC);
CREATE INDEX eventos_dominio_tipo_idx
    ON eventos_dominio (tipo, criado_em);
CREATE INDEX eventos_dominio_correlacao_idx
    ON eventos_dominio (correlacao_id);
CREATE INDEX eventos_dominio_ator_idx
    ON eventos_dominio (ator_id);

COMMENT ON TABLE eventos_dominio IS
    'Fatos de negócio imutáveis (append-only). Inserir sempre na transação da regra de negócio.';
COMMENT ON COLUMN eventos_dominio.chave_deduplicacao IS
    'Chave natural do fato (ex.: captacao.etapa_alterada:<contato>:<versao>). Violação 23505 indica evento já registrado.';

-- Eventos são fatos ocorridos: nunca são reescritos nem apagados.
CREATE TRIGGER eventos_dominio_sem_update_delete
    BEFORE UPDATE OR DELETE ON eventos_dominio
    FOR EACH ROW EXECUTE FUNCTION historico_bloquear_mutacao();
CREATE TRIGGER eventos_dominio_sem_truncate
    BEFORE TRUNCATE ON eventos_dominio
    FOR EACH STATEMENT EXECUTE FUNCTION historico_bloquear_mutacao();

CREATE TABLE caixa_saida (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Exatamente uma mensagem por evento.
    evento_id UUID NOT NULL REFERENCES eventos_dominio(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- Cópia do tipo do evento, usada pelo publicador para roteamento.
    topico VARCHAR(100) NOT NULL,
    situacao VARCHAR(15) NOT NULL DEFAULT 'pendente',
    tentativas INTEGER NOT NULL DEFAULT 0,
    -- Próximo instante em que a mensagem pode ser coletada (backoff de reprocessamento).
    disponivel_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Concessão temporária do publicador; vencida, a mensagem volta a ser elegível.
    bloqueado_ate TIMESTAMPTZ(6),
    publicado_em TIMESTAMPTZ(6),
    ultimo_erro VARCHAR(2000),
    CONSTRAINT caixa_saida_evento_unico UNIQUE (evento_id),
    CONSTRAINT caixa_saida_situacao_valida
        CHECK (situacao IN ('pendente', 'processando', 'publicado', 'falhou')),
    CONSTRAINT caixa_saida_tentativas_validas
        CHECK (tentativas >= 0),
    CONSTRAINT caixa_saida_publicado_em_compativel
        CHECK ((situacao = 'publicado') = (publicado_em IS NOT NULL)),
    CONSTRAINT caixa_saida_bloqueio_compativel
        CHECK (situacao = 'processando' OR bloqueado_ate IS NULL)
);

-- Fila do publicador: SELECT ... WHERE situacao = 'pendente' AND disponivel_em <= now()
-- ORDER BY disponivel_em FOR UPDATE SKIP LOCKED.
CREATE INDEX caixa_saida_pendentes_idx
    ON caixa_saida (disponivel_em)
    WHERE situacao = 'pendente';
CREATE INDEX caixa_saida_processando_idx
    ON caixa_saida (bloqueado_ate)
    WHERE situacao = 'processando';

COMMENT ON TABLE caixa_saida IS
    'Outbox transacional: preenchida automaticamente pelo trigger de eventos_dominio; nunca inserir manualmente.';

-- Gravação atômica: o evento e sua mensagem nascem no mesmo comando/transação.
CREATE FUNCTION eventos_dominio_enfileirar_caixa_saida()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO caixa_saida (evento_id, topico, disponivel_em)
    VALUES (NEW.id, NEW.tipo, NEW.criado_em);
    RETURN NULL;
END;
$$;

CREATE TRIGGER eventos_dominio_enfileirar
    AFTER INSERT ON eventos_dominio
    FOR EACH ROW EXECUTE FUNCTION eventos_dominio_enfileirar_caixa_saida();

-- Ciclo de vida da mensagem: pendente -> processando -> publicado | pendente | falhou.
-- Somente colunas de controle podem mudar; vínculo com o evento é imutável.
CREATE FUNCTION caixa_saida_validar_mutacao()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.situacao <> 'publicado' THEN
            RAISE EXCEPTION 'Somente mensagens publicadas podem ser removidas da caixa de saída.'
                USING ERRCODE = '55000';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.evento_id IS DISTINCT FROM OLD.evento_id
       OR NEW.topico IS DISTINCT FROM OLD.topico
       OR NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
        RAISE EXCEPTION 'O vínculo da mensagem com o evento de domínio é imutável.'
            USING ERRCODE = '55000';
    END IF;

    IF OLD.situacao = 'publicado' THEN
        RAISE EXCEPTION 'Mensagem já publicada não pode ser alterada.'
            USING ERRCODE = '55000';
    END IF;

    IF NEW.tentativas < OLD.tentativas THEN
        RAISE EXCEPTION 'O contador de tentativas não pode ser reduzido.'
            USING ERRCODE = '55000';
    END IF;

    NEW.atualizado_em := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER caixa_saida_controlar_mutacao
    BEFORE UPDATE OR DELETE ON caixa_saida
    FOR EACH ROW EXECUTE FUNCTION caixa_saida_validar_mutacao();

-- TRUNCATE descartaria mensagens pendentes sem passar pela regra acima.
CREATE TRIGGER caixa_saida_sem_truncate
    BEFORE TRUNCATE ON caixa_saida
    FOR EACH STATEMENT EXECUTE FUNCTION historico_bloquear_mutacao();

-- Impede que a fila seja preenchida fora do trigger (mensagem órfã ou duplicada por aplicação).
CREATE FUNCTION caixa_saida_validar_insercao()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'caixa_saida é preenchida somente pelo registro de eventos_dominio.'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER caixa_saida_somente_via_evento
    BEFORE INSERT ON caixa_saida
    FOR EACH ROW EXECUTE FUNCTION caixa_saida_validar_insercao();
