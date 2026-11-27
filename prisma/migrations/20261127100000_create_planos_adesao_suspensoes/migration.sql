-- PB-060: adesões financeiras e suspensões temporais de planos.
-- Necessária para igualdade UUID em EXCLUDE USING GIST (o mesmo padrão da PB-058).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE planos_adesao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    contato_id UUID NOT NULL REFERENCES contatos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- Modalidades e dia de vencimento confirmados em PB-019/PB-020 e nos cadernos de QA/UX.
    modalidade VARCHAR(10) NOT NULL CHECK (modalidade IN ('Pontual', 'Recorrente')),
    -- Único campo monetário definido na especificação funcional: valor pactuado da adesão.
    valor_pactuado NUMERIC(14,2) NOT NULL CHECK (valor_pactuado > 0),
    dia_vencimento SMALLINT,
    data_adesao TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT planos_adesao_vencimento_valido CHECK (
        (modalidade = 'Pontual' AND dia_vencimento IS NULL)
        OR (modalidade = 'Recorrente' AND dia_vencimento IS NOT NULL
            AND dia_vencimento BETWEEN 1 AND 28)
    )
);
CREATE FUNCTION planos_adesao_atualizar_timestamp() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.atualizado_em := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER planos_adesao_atualizado_em BEFORE UPDATE ON planos_adesao
    FOR EACH ROW EXECUTE FUNCTION planos_adesao_atualizar_timestamp();
CREATE INDEX planos_adesao_contato_idx ON planos_adesao(contato_id);

CREATE TABLE suspensoes_plano (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    plano_adesao_id UUID NOT NULL REFERENCES planos_adesao(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    inicio_em TIMESTAMPTZ(6) NOT NULL,
    fim_em TIMESTAMPTZ(6),
    CONSTRAINT suspensoes_plano_periodo_valido CHECK (fim_em IS NULL OR fim_em > inicio_em),
    -- Intervalo semiaberto [início, fim): períodos adjacentes são permitidos.
    -- O GiST garante a regra também entre transações concorrentes (SQLSTATE 23P01).
    CONSTRAINT suspensoes_plano_sem_sobreposicao EXCLUDE USING gist (
        plano_adesao_id WITH =,
        tstzrange(inicio_em, fim_em, '[)') WITH &&
    )
);
CREATE INDEX suspensoes_plano_adesao_inicio_idx ON suspensoes_plano(plano_adesao_id, inicio_em);

COMMENT ON CONSTRAINT suspensoes_plano_sem_sobreposicao ON suspensoes_plano IS
    'Impede períodos de suspensão sobrepostos para a mesma adesão; não é representável no schema Prisma.';
