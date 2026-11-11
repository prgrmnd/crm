-- Necessária para igualdade UUID/texto em uma exclusion constraint GiST concorrente.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE interacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    contato_id UUID NOT NULL REFERENCES contatos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    canal VARCHAR(20) NOT NULL CHECK (canal IN ('telefone', 'whatsapp', 'reuniao', 'email')),
    ocorrido_em TIMESTAMPTZ(6) NOT NULL CHECK (ocorrido_em <= CURRENT_TIMESTAMP),
    resumo VARCHAR(3000) NOT NULL CHECK (length(trim(resumo)) > 0),
    autor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX interacoes_contato_ocorrido_idx ON interacoes(contato_id, ocorrido_em);
CREATE INDEX interacoes_autor_idx ON interacoes(autor_id);

CREATE TABLE respostas_contato (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    contato_id UUID NOT NULL REFERENCES contatos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    classificacao VARCHAR(20) NOT NULL CHECK (classificacao IN ('positiva', 'negativa', 'descadastro')),
    conteudo VARCHAR(3000) NOT NULL CHECK (length(trim(conteudo)) > 0),
    envio_destinatario_id UUID,
    autor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
COMMENT ON COLUMN respostas_contato.envio_destinatario_id IS
    'UUID opcional; adicionar FK quando envio_destinatarios existir.';
CREATE INDEX respostas_contato_timeline_idx ON respostas_contato(contato_id, criado_em);
CREATE INDEX respostas_contato_autor_idx ON respostas_contato(autor_id);

CREATE TABLE preferencias_comunicacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    contato_id UUID NOT NULL REFERENCES contatos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    canal VARCHAR(10) NOT NULL CHECK (canal = 'email'),
    situacao VARCHAR(15) NOT NULL CHECK (situacao IN ('permitido', 'descadastrado')),
    vigente_desde TIMESTAMPTZ(6) NOT NULL,
    vigente_ate TIMESTAMPTZ(6),
    motivo TEXT,
    resposta_id UUID REFERENCES respostas_contato(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    autor_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT preferencias_periodo_valido CHECK (vigente_ate IS NULL OR vigente_ate > vigente_desde),
    CONSTRAINT preferencias_sem_sobreposicao EXCLUDE USING gist (
        contato_id WITH =, canal WITH =,
        tstzrange(vigente_desde, vigente_ate, '[)') WITH &&
    )
);
CREATE UNIQUE INDEX preferencias_uma_atual_por_canal ON preferencias_comunicacao(contato_id, canal)
    WHERE vigente_ate IS NULL;
CREATE INDEX preferencias_contato_canal_desde_idx ON preferencias_comunicacao(contato_id, canal, vigente_desde);
CREATE INDEX preferencias_resposta_idx ON preferencias_comunicacao(resposta_id);
CREATE INDEX preferencias_autor_idx ON preferencias_comunicacao(autor_id);

CREATE FUNCTION historico_bloquear_mutacao() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% é imutável; operação % proibida.', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER interacoes_sem_update_delete BEFORE UPDATE OR DELETE ON interacoes
    FOR EACH ROW EXECUTE FUNCTION historico_bloquear_mutacao();
CREATE TRIGGER interacoes_sem_truncate BEFORE TRUNCATE ON interacoes
    FOR EACH STATEMENT EXECUTE FUNCTION historico_bloquear_mutacao();
CREATE TRIGGER respostas_sem_update_delete BEFORE UPDATE OR DELETE ON respostas_contato
    FOR EACH ROW EXECUTE FUNCTION historico_bloquear_mutacao();
CREATE TRIGGER respostas_sem_truncate BEFORE TRUNCATE ON respostas_contato
    FOR EACH STATEMENT EXECUTE FUNCTION historico_bloquear_mutacao();

-- Preserva o histórico; uma versão só pode ser encerrada uma vez.
CREATE FUNCTION preferencias_validar_mutacao() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Preferências não podem ser excluídas.' USING ERRCODE = '55000';
    END IF;
    IF OLD.vigente_ate IS NOT NULL OR NEW.vigente_ate IS NULL
       OR (to_jsonb(NEW) - 'vigente_ate') IS DISTINCT FROM (to_jsonb(OLD) - 'vigente_ate') THEN
        RAISE EXCEPTION 'Somente encerrar a vigência atual é permitido.' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preferencias_somente_encerrar BEFORE UPDATE OR DELETE ON preferencias_comunicacao
    FOR EACH ROW EXECUTE FUNCTION preferencias_validar_mutacao();
CREATE TRIGGER preferencias_sem_truncate BEFORE TRUNCATE ON preferencias_comunicacao
    FOR EACH STATEMENT EXECUTE FUNCTION historico_bloquear_mutacao();

-- Equivalência ao optOut=false do protótipo; não representa ratificação institucional de consentimento.
INSERT INTO preferencias_comunicacao(contato_id, canal, situacao, vigente_desde)
    SELECT id, 'email', 'permitido', criado_em FROM contatos;
CREATE FUNCTION contatos_preferencia_inicial() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO preferencias_comunicacao(contato_id, canal, situacao, vigente_desde)
        VALUES (NEW.id, 'email', 'permitido', NEW.criado_em);
    RETURN NEW;
END;
$$;
CREATE TRIGGER contatos_inicializar_preferencia AFTER INSERT ON contatos
    FOR EACH ROW EXECUTE FUNCTION contatos_preferencia_inicial();

-- A resposta é a entrada canônica do descadastro: todos os efeitos pertencem à mesma transação.
CREATE FUNCTION respostas_aplicar_descadastro() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    atual preferencias_comunicacao%ROWTYPE;
    instante TIMESTAMPTZ(6);
    preferencia_id UUID;
BEGIN
    IF NEW.classificacao <> 'descadastro' THEN RETURN NEW; END IF;
    -- Serializa descadastros do mesmo contato, inclusive quando não existe preferência atual.
    -- NO KEY UPDATE é compatível com o KEY SHARE adquirido pelas FKs das respostas.
    PERFORM 1 FROM contatos WHERE id = NEW.contato_id FOR NO KEY UPDATE;
    SELECT * INTO atual FROM preferencias_comunicacao
        WHERE contato_id = NEW.contato_id AND canal = 'email' AND vigente_ate IS NULL FOR UPDATE;
    instante := clock_timestamp();
    IF atual.id IS NOT NULL THEN
        instante := greatest(instante, atual.vigente_desde + interval '1 microsecond');
        UPDATE preferencias_comunicacao SET vigente_ate = instante WHERE id = atual.id;
    END IF;
    INSERT INTO preferencias_comunicacao(contato_id, canal, situacao, vigente_desde, motivo, resposta_id, autor_id)
        VALUES (NEW.contato_id, 'email', 'descadastrado', instante, 'Pedido de descadastro', NEW.id, NEW.autor_id)
        RETURNING id INTO preferencia_id;
    INSERT INTO eventos_auditoria(ator_tipo, ator_id, contato_id, acao, entidade_tipo, entidade_id,
                                 antes, depois, motivo, correlacao_id)
        VALUES ('usuario', NEW.autor_id, NEW.contato_id, 'comunicacao.descadastro', 'preferencias_comunicacao',
                preferencia_id,
                CASE WHEN atual.id IS NULL THEN NULL ELSE jsonb_build_object('situacao', atual.situacao) END,
                jsonb_build_object('situacao', 'descadastrado', 'resposta_id', NEW.id, 'vigente_desde', instante),
                'Pedido de descadastro', NEW.id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER respostas_registrar_descadastro AFTER INSERT ON respostas_contato
    FOR EACH ROW EXECUTE FUNCTION respostas_aplicar_descadastro();
