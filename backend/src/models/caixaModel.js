const db = require('../config/database');

const TIPOS_MOVIMENTACAO = ['SUPRIMENTO', 'SANGRIA', 'DESPESA'];

function erroCaixa(mensagem, status = 400) {
    return Object.assign(new Error(mensagem), { status });
}

function idValido(valor) {
    const id = Number(valor);
    if (!Number.isInteger(id) || id <= 0) throw erroCaixa('Identificação de caixa inválida.');
    return id;
}

function valorEmCentavos(valor, permitirZero = false) {
    if (valor === undefined || valor === null || String(valor).trim() === '') {
        throw erroCaixa('Informe um valor válido.');
    }
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0 || (!permitirZero && numero === 0)) {
        throw erroCaixa(permitirZero
            ? 'Informe um valor válido e não negativo.'
            : 'Informe um valor válido e maior que zero.');
    }
    const centavos = Math.round(numero * 100);
    if (!Number.isSafeInteger(centavos) || centavos > 999999999999 ||
        Math.abs(numero * 100 - centavos) > 1e-7 || (!permitirZero && centavos === 0)) {
        throw erroCaixa('O valor informado está fora do limite permitido.');
    }
    return centavos;
}

function validarPeriodo(inicio, fim) {
    const validarData = (valor) => {
        if (!valor) return true;
        if (typeof valor !== 'string') return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
        const data = new Date(`${valor}T00:00:00.000Z`);
        return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
    };
    if (!validarData(inicio) || !validarData(fim)) {
        throw erroCaixa('Informe o período no formato AAAA-MM-DD.');
    }
    if (inicio && fim && inicio > fim) {
        throw erroCaixa('A data inicial não pode ser posterior à data final.');
    }
}

function normalizarTexto(valor) {
    return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

async function carregarResumo(connection, idCaixa, caixa) {
    const [vendas] = await connection.query(`
        SELECT COUNT(*) AS quantidade, COALESCE(SUM(valor_total), 0) AS total
        FROM venda
        WHERE id_caixa = ? AND status = 'FINALIZADA'
    `, [idCaixa]);

    const [pagamentos] = await connection.query(`
        SELECT
            fp.id_forma_pagamento,
            fp.descricao,
            COALESCE(SUM(CASE WHEN v.id_venda IS NOT NULL THEN pg.valor ELSE 0 END), 0) AS total_vendido,
            COUNT(DISTINCT v.id_venda) AS quantidade_vendas
        FROM forma_pagamento fp
        LEFT JOIN pagamento pg
            ON pg.id_forma_pagamento = fp.id_forma_pagamento
            AND pg.status = 'APROVADO'
        LEFT JOIN venda v
            ON v.id_venda = pg.id_venda
            AND v.id_caixa = ?
            AND v.status = 'FINALIZADA'
        WHERE fp.status = 'ATIVA' OR v.id_venda IS NOT NULL
        GROUP BY fp.id_forma_pagamento, fp.descricao
        ORDER BY fp.id_forma_pagamento
    `, [idCaixa]);

    const [movimentacoes] = await connection.query(`
        SELECT
            COALESCE(SUM(CASE WHEN tipo = 'SUPRIMENTO' THEN valor ELSE 0 END), 0) AS suprimentos,
            COALESCE(SUM(CASE WHEN tipo = 'SANGRIA' THEN valor ELSE 0 END), 0) AS sangrias,
            COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0) AS despesas
        FROM caixa_movimentacao
        WHERE id_caixa = ?
    `, [idCaixa]);

    const totalDinheiroVendido = pagamentos.reduce((total, pagamento) => (
        normalizarTexto(pagamento.descricao) === 'dinheiro'
            ? total + Math.round(Number(pagamento.total_vendido) * 100)
            : total
    ), 0);
    const totalVendasCentavos = Math.round(Number(vendas[0].total) * 100);
    const suprimentosCentavos = Math.round(Number(movimentacoes[0].suprimentos) * 100);
    const sangriasCentavos = Math.round(Number(movimentacoes[0].sangrias) * 100);
    const despesasCentavos = Math.round(Number(movimentacoes[0].despesas) * 100);
    const valorInicialCentavos = Math.round(Number(caixa.valor_inicial) * 100);

    return {
        quantidade_vendas: Number(vendas[0].quantidade),
        total_vendas: totalVendasCentavos / 100,
        total_dinheiro_vendido: totalDinheiroVendido / 100,
        suprimentos: suprimentosCentavos / 100,
        sangrias: sangriasCentavos / 100,
        despesas: despesasCentavos / 100,
        saldo_esperado_dinheiro: (
            valorInicialCentavos + totalDinheiroVendido + suprimentosCentavos -
            sangriasCentavos - despesasCentavos
        ) / 100,
        pagamentos: pagamentos.map(pagamento => ({
            ...pagamento,
            total_vendido: Number(pagamento.total_vendido)
        }))
    };
}

async function emTransacao(callback) {
    const connection = await db.getConnection();
    let transacaoIniciada = false;
    try {
        await connection.beginTransaction();
        transacaoIniciada = true;
        const resultado = await callback(connection);
        await connection.commit();
        transacaoIniciada = false;
        return resultado;
    } catch (erro) {
        if (transacaoIniciada) await connection.rollback();
        throw erro;
    } finally {
        connection.release();
    }
}

const CaixaModel = {
    async listarFormasPagamento() {
        const [formas] = await db.query(`
            SELECT id_forma_pagamento, descricao
            FROM forma_pagamento
            WHERE status = 'ATIVA'
            ORDER BY id_forma_pagamento
        `);
        return formas;
    },

    async abrir({ valor_inicial, id_usuario } = {}) {
        const valorCentavos = valorEmCentavos(valor_inicial, true);
        const usuarioId = idValido(id_usuario);
        const connection = await db.getConnection();
        let lockAdquirido = false;
        let transacaoIniciada = false;
        try {
            const [locks] = await connection.query(
                `SELECT GET_LOCK('pdv_caixa_abertura', 10) AS adquirido`
            );
            lockAdquirido = Number(locks[0]?.adquirido) === 1;
            if (!lockAdquirido) throw erroCaixa('Não foi possível iniciar a abertura do caixa. Tente novamente.', 503);

            await connection.beginTransaction();
            transacaoIniciada = true;
            const [abertos] = await connection.query(`
                SELECT id_caixa
                FROM caixa
                WHERE status = 'ABERTO'
                ORDER BY id_caixa DESC
                LIMIT 1
                FOR UPDATE
            `);
            if (abertos.length > 0) throw erroCaixa('Já existe um caixa aberto. Feche-o antes de abrir outro.', 409);

            const [resultado] = await connection.query(`
                INSERT INTO caixa (valor_inicial, status, observacao, id_usuario_abertura)
                VALUES (?, 'ABERTO', 'Abertura registrada pelo módulo Caixa', ?)
            `, [valorCentavos / 100, usuarioId]);
            await connection.commit();
            transacaoIniciada = false;
            return { id_caixa: resultado.insertId };
        } catch (erro) {
            if (transacaoIniciada) await connection.rollback();
            throw erro;
        } finally {
            try {
                if (lockAdquirido) {
                    await connection.query(`SELECT RELEASE_LOCK('pdv_caixa_abertura')`);
                }
            } finally {
                connection.release();
            }
        }
    },

    async obterAtual() {
        const connection = await db.getConnection();
        let transacaoIniciada = false;
        try {
            await connection.beginTransaction();
            transacaoIniciada = true;
            const [caixas] = await connection.query(`
                SELECT c.*, ua.nome AS operador_abertura
                FROM caixa c
                INNER JOIN usuario ua ON ua.id_usuario = c.id_usuario_abertura
                WHERE c.status = 'ABERTO'
                ORDER BY c.id_caixa DESC
                LIMIT 1
            `);
            if (caixas.length === 0) {
                await connection.commit();
                transacaoIniciada = false;
                return null;
            }
            const caixa = caixas[0];
            const resumo = await carregarResumo(connection, caixa.id_caixa, caixa);
            await connection.commit();
            transacaoIniciada = false;
            return { ...caixa, ...resumo };
        } catch (erro) {
            if (transacaoIniciada) await connection.rollback();
            throw erro;
        } finally {
            connection.release();
        }
    },

    async listarMovimentacoes(idCaixa, { tipo, inicio, fim } = {}) {
        const caixaId = idValido(idCaixa);
        validarPeriodo(inicio, fim);
        if (tipo && !TIPOS_MOVIMENTACAO.includes(tipo)) {
            throw erroCaixa('Tipo de movimentação inválido.');
        }

        const filtros = ['m.id_caixa = ?'];
        const parametros = [caixaId];
        if (tipo) {
            filtros.push('m.tipo = ?');
            parametros.push(tipo);
        }
        if (inicio) {
            filtros.push('m.data_hora >= ?');
            parametros.push(`${inicio} 00:00:00`);
        }
        if (fim) {
            filtros.push('m.data_hora < DATE_ADD(?, INTERVAL 1 DAY)');
            parametros.push(`${fim} 00:00:00`);
        }
        const [rows] = await db.query(`
            SELECT m.id_movimentacao, m.tipo, m.valor, m.descricao, m.categoria,
                m.data_hora, u.nome AS responsavel
            FROM caixa_movimentacao m
            INNER JOIN usuario u ON u.id_usuario = m.id_usuario
            WHERE ${filtros.join(' AND ')}
            ORDER BY m.data_hora DESC, m.id_movimentacao DESC
        `, parametros);
        return rows;
    },

    async registrarMovimentacao(idCaixa, dados = {}, idUsuario) {
        const caixaId = idValido(idCaixa);
        const usuarioId = idValido(idUsuario);
        const tipo = String(dados.tipo || '').toUpperCase();
        const valorCentavos = valorEmCentavos(dados.valor);
        const descricao = typeof dados.descricao === 'string' ? dados.descricao.trim() : '';
        const categoria = typeof dados.categoria === 'string' ? dados.categoria.trim() : '';

        if (!TIPOS_MOVIMENTACAO.includes(tipo)) throw erroCaixa('Tipo de movimentação inválido.');
        if (!descricao || descricao.length > 255) {
            throw erroCaixa('Informe uma descrição ou justificativa com até 255 caracteres.');
        }
        if (tipo === 'DESPESA' && (!categoria || categoria.length > 80)) {
            throw erroCaixa('Informe uma categoria para a despesa, com até 80 caracteres.');
        }

        return emTransacao(async connection => {
            const [caixas] = await connection.query(`
                SELECT status FROM caixa WHERE id_caixa = ? FOR UPDATE
            `, [caixaId]);
            if (caixas.length === 0) throw erroCaixa('Caixa não encontrado.', 404);
            if (caixas[0].status !== 'ABERTO') throw erroCaixa('O caixa está fechado e não aceita movimentações.', 409);

            const [resultado] = await connection.query(`
                INSERT INTO caixa_movimentacao (id_caixa, tipo, valor, descricao, categoria, id_usuario)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                caixaId,
                tipo,
                valorCentavos / 100,
                descricao,
                tipo === 'DESPESA' ? categoria : null,
                usuarioId
            ]);
            return { id_movimentacao: resultado.insertId };
        });
    },

    async fechar(idCaixa, dados = {}, idUsuario) {
        const caixaId = idValido(idCaixa);
        const usuarioId = idValido(idUsuario);
        if (!Array.isArray(dados.conferencias)) throw erroCaixa('Informe os valores conferidos por forma de pagamento.');

        return emTransacao(async connection => {
            const [caixas] = await connection.query(`
                SELECT c.*, ua.nome AS operador_abertura
                FROM caixa c
                INNER JOIN usuario ua ON ua.id_usuario = c.id_usuario_abertura
                WHERE c.id_caixa = ?
                FOR UPDATE
            `, [caixaId]);
            if (caixas.length === 0) throw erroCaixa('Caixa não encontrado.', 404);
            const caixa = caixas[0];
            if (caixa.status !== 'ABERTO') throw erroCaixa('Este caixa já está fechado.', 409);

            const resumo = await carregarResumo(connection, caixaId, caixa);
            const conferenciasPorId = new Map();
            for (const conferencia of dados.conferencias) {
                const idForma = idValido(conferencia.id_forma_pagamento);
                if (conferenciasPorId.has(idForma)) throw erroCaixa('Há formas de pagamento repetidas na conferência.');
                conferenciasPorId.set(idForma, {
                    informado: valorEmCentavos(conferencia.valor_informado, true),
                    esperado: valorEmCentavos(conferencia.valor_esperado, true)
                });
            }

            const formasAtivas = resumo.pagamentos;
            if (formasAtivas.length === 0 || formasAtivas.length !== conferenciasPorId.size ||
                formasAtivas.some(forma => !conferenciasPorId.has(Number(forma.id_forma_pagamento)))) {
                throw erroCaixa('Confira todas as formas de pagamento ativas antes de fechar o caixa.');
            }

            const formasFechamento = formasAtivas.map(forma => {
                const esperadoCentavos = normalizarTexto(forma.descricao) === 'dinheiro'
                    ? Math.round(resumo.saldo_esperado_dinheiro * 100)
                    : Math.round(Number(forma.total_vendido) * 100);
                const conferencia = conferenciasPorId.get(Number(forma.id_forma_pagamento));
                if (conferencia.esperado !== esperadoCentavos) {
                    throw erroCaixa('As vendas ou movimentações mudaram durante a conferência. Revise os valores antes de fechar.', 409);
                }
                const informadoCentavos = conferencia.informado;
                return {
                    id_forma_pagamento: forma.id_forma_pagamento,
                    descricao: forma.descricao,
                    esperado_centavos: esperadoCentavos,
                    informado_centavos: informadoCentavos,
                    diferenca_centavos: informadoCentavos - esperadoCentavos
                };
            });

            const dinheiro = formasFechamento.find(forma => normalizarTexto(forma.descricao) === 'dinheiro');
            if (!dinheiro) throw erroCaixa('A forma de pagamento Dinheiro deve estar ativa para fechar o caixa.', 409);
            const diferencaTotalCentavos = formasFechamento.reduce((total, forma) => total + forma.diferenca_centavos, 0);
            const [fechamento] = await connection.query(`
                INSERT INTO caixa_fechamento (
                    id_caixa, id_usuario, total_vendas, total_dinheiro_vendido,
                    total_suprimentos, total_sangrias, total_despesas,
                    saldo_esperado_dinheiro, saldo_informado_dinheiro,
                    diferenca_dinheiro, diferenca_total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                caixaId,
                usuarioId,
                resumo.total_vendas,
                resumo.total_dinheiro_vendido,
                resumo.suprimentos,
                resumo.sangrias,
                resumo.despesas,
                resumo.saldo_esperado_dinheiro,
                dinheiro.informado_centavos / 100,
                dinheiro.diferenca_centavos / 100,
                diferencaTotalCentavos / 100
            ]);

            for (const forma of formasFechamento) {
                await connection.query(`
                    INSERT INTO caixa_fechamento_pagamento (
                        id_fechamento, id_forma_pagamento, descricao,
                        valor_esperado, valor_informado, diferenca
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    fechamento.insertId,
                    forma.id_forma_pagamento,
                    forma.descricao,
                    forma.esperado_centavos / 100,
                    forma.informado_centavos / 100,
                    forma.diferenca_centavos / 100
                ]);
            }

            await connection.query(`
                UPDATE caixa
                SET status = 'FECHADO', data_fechamento = CURRENT_TIMESTAMP,
                    valor_final = ?, id_usuario_fechamento = ?
                WHERE id_caixa = ? AND status = 'ABERTO'
            `, [dinheiro.informado_centavos / 100, usuarioId, caixaId]);

            return {
                id_fechamento: fechamento.insertId,
                saldo_esperado_dinheiro: resumo.saldo_esperado_dinheiro,
                saldo_informado_dinheiro: dinheiro.informado_centavos / 100,
                diferenca_dinheiro: dinheiro.diferenca_centavos / 100,
                diferenca_total: diferencaTotalCentavos / 100,
                pagamentos: formasFechamento.map(forma => ({
                    descricao: forma.descricao,
                    esperado: forma.esperado_centavos / 100,
                    informado: forma.informado_centavos / 100,
                    diferenca: forma.diferenca_centavos / 100
                }))
            };
        });
    },

    async listarHistorico() {
        const [rows] = await db.query(`
            SELECT c.id_caixa, c.status, c.data_abertura, c.data_fechamento,
                c.valor_inicial, c.valor_final, ua.nome AS operador_abertura,
                uf.nome AS operador_fechamento,
                COALESCE(cf.total_vendas, (
                    SELECT COALESCE(SUM(v.valor_total), 0)
                    FROM venda v
                    WHERE v.id_caixa = c.id_caixa AND v.status = 'FINALIZADA'
                )) AS total_vendas,
                COALESCE(cf.diferenca_dinheiro, 0) AS diferenca_dinheiro,
                COALESCE(cf.diferenca_total, 0) AS diferenca_total
            FROM caixa c
            INNER JOIN usuario ua ON ua.id_usuario = c.id_usuario_abertura
            LEFT JOIN usuario uf ON uf.id_usuario = c.id_usuario_fechamento
            LEFT JOIN caixa_fechamento cf ON cf.id_caixa = c.id_caixa
            ORDER BY c.id_caixa DESC
        `);
        return rows;
    },

    async obterDetalhes(idCaixa) {
        const caixaId = idValido(idCaixa);
        return emTransacao(async connection => {
            const [caixas] = await connection.query(`
                SELECT c.*, ua.nome AS operador_abertura, uf.nome AS operador_fechamento,
                    cf.id_fechamento, cf.total_dinheiro_vendido,
                    cf.total_suprimentos, cf.total_sangrias, cf.total_despesas,
                    cf.saldo_esperado_dinheiro, cf.saldo_informado_dinheiro,
                    cf.diferenca_dinheiro, cf.diferenca_total,
                    COALESCE(cf.total_vendas, (
                        SELECT COALESCE(SUM(v.valor_total), 0)
                        FROM venda v
                        WHERE v.id_caixa = c.id_caixa AND v.status = 'FINALIZADA'
                    )) AS total_vendas
                FROM caixa c
                INNER JOIN usuario ua ON ua.id_usuario = c.id_usuario_abertura
                LEFT JOIN usuario uf ON uf.id_usuario = c.id_usuario_fechamento
                LEFT JOIN caixa_fechamento cf ON cf.id_caixa = c.id_caixa
                WHERE c.id_caixa = ?
                FOR UPDATE
            `, [caixaId]);
            if (caixas.length === 0) throw erroCaixa('Caixa não encontrado.', 404);

            const [movimentacoes] = await connection.query(`
                SELECT m.id_movimentacao, m.tipo, m.valor, m.descricao, m.categoria,
                    m.data_hora, u.nome AS responsavel
                FROM caixa_movimentacao m
                INNER JOIN usuario u ON u.id_usuario = m.id_usuario
                WHERE m.id_caixa = ?
                ORDER BY m.data_hora, m.id_movimentacao
            `, [caixaId]);
            const [vendasRegistradas] = await connection.query(`
                SELECT v.id_venda, v.data_hora, v.valor_total, v.status, v.observacao,
                    u.nome AS operador,
                    pg.id_pagamento, pg.valor AS valor_pagamento, pg.status AS status_pagamento,
                    pg.data_hora AS data_hora_pagamento, fp.descricao AS forma_pagamento
                FROM venda v
                INNER JOIN usuario u ON u.id_usuario = v.id_usuario
                LEFT JOIN pagamento pg ON pg.id_venda = v.id_venda
                LEFT JOIN forma_pagamento fp ON fp.id_forma_pagamento = pg.id_forma_pagamento
                WHERE v.id_caixa = ?
                ORDER BY v.data_hora, v.id_venda, pg.id_pagamento
            `, [caixaId]);
            const vendasPorId = new Map();
            for (const linha of vendasRegistradas) {
                let venda = vendasPorId.get(linha.id_venda);
                if (!venda) {
                    venda = {
                        id_venda: linha.id_venda,
                        data_hora: linha.data_hora,
                        valor_total: Number(linha.valor_total),
                        status: linha.status,
                        observacao: linha.observacao,
                        operador: linha.operador,
                        pagamentos: []
                    };
                    vendasPorId.set(linha.id_venda, venda);
                }
                if (linha.id_pagamento !== null) {
                    venda.pagamentos.push({
                        id_pagamento: linha.id_pagamento,
                        forma_pagamento: linha.forma_pagamento,
                        valor: Number(linha.valor_pagamento),
                        status: linha.status_pagamento,
                        data_hora: linha.data_hora_pagamento
                    });
                }
            }
            const [pagamentosFechamento] = await connection.query(`
                SELECT id_forma_pagamento, descricao, valor_esperado, valor_informado, diferenca
                FROM caixa_fechamento_pagamento
                WHERE id_fechamento = ?
                ORDER BY id_forma_pagamento
            `, [caixas[0].id_fechamento || 0]);

            let caixa = caixas[0];
            let pagamentos = pagamentosFechamento;
            if (caixa.status === 'ABERTO') {
                const resumo = await carregarResumo(connection, caixaId, caixa);
                caixa = { ...caixa, ...resumo };
                pagamentos = resumo.pagamentos.map(pagamento => ({
                    id_forma_pagamento: pagamento.id_forma_pagamento,
                    descricao: pagamento.descricao,
                    valor_esperado: normalizarTexto(pagamento.descricao) === 'dinheiro'
                        ? resumo.saldo_esperado_dinheiro
                        : Number(pagamento.total_vendido),
                    valor_informado: null,
                    diferenca: null
                }));
            }

            return { ...caixa, movimentacoes, vendas: [...vendasPorId.values()], pagamentos };
        });
    },

    TIPOS_MOVIMENTACAO
};

module.exports = CaixaModel;
