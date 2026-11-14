const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const db = require('../src/config/database');
const CaixaModel = require('../src/models/caixaModel');

let chamadas;
let dadosCaixa;
let existeCaixaAberto;

beforeEach(() => {
    chamadas = [];
    existeCaixaAberto = false;
    dadosCaixa = {
        id_caixa: 7,
        valor_inicial: 100,
        status: 'ABERTO',
        id_usuario_abertura: 4
    };

    db.getConnection = async () => ({
        beginTransaction: async () => chamadas.push({ sql: 'BEGIN' }),
        commit: async () => chamadas.push({ sql: 'COMMIT' }),
        rollback: async () => chamadas.push({ sql: 'ROLLBACK' }),
        release: () => chamadas.push({ sql: 'RELEASE' }),
        query: async (consulta, parametros = []) => {
            const sql = consulta.replace(/\s+/g, ' ').trim();
            chamadas.push({ sql, parametros });

            if (sql.includes('GET_LOCK')) return [[{ adquirido: 1 }], undefined];
            if (sql.includes('RELEASE_LOCK')) return [[{ liberado: 1 }], undefined];
            if (sql.startsWith('SELECT id_caixa FROM caixa')) {
                return [existeCaixaAberto ? [{ id_caixa: 3 }] : [], undefined];
            }
            if (sql.startsWith('SELECT status FROM caixa')) {
                return [[{ status: dadosCaixa.status }], undefined];
            }
            if (sql.startsWith('SELECT c.*, ua.nome AS operador_abertura')) return [[dadosCaixa], undefined];
            if (sql.startsWith('SELECT m.id_movimentacao')) {
                return [[{
                    id_movimentacao: 17,
                    tipo: 'SANGRIA',
                    valor: 5,
                    descricao: 'Retirada para troco',
                    categoria: null,
                    data_hora: '2026-11-14 10:30:00',
                    responsavel: 'Operador'
                }], undefined];
            }
            if (sql.startsWith('SELECT v.id_venda')) {
                return [[
                    {
                        id_venda: 31,
                        data_hora: '2026-11-14 10:00:00',
                        valor_total: 30,
                        status: 'FINALIZADA',
                        observacao: 'Venda balcão',
                        operador: 'Operador',
                        id_pagamento: 41,
                        valor_pagamento: 10,
                        status_pagamento: 'APROVADO',
                        data_hora_pagamento: '2026-11-14 10:00:00',
                        forma_pagamento: 'Dinheiro'
                    },
                    {
                        id_venda: 31,
                        data_hora: '2026-11-14 10:00:00',
                        valor_total: 30,
                        status: 'FINALIZADA',
                        observacao: 'Venda balcão',
                        operador: 'Operador',
                        id_pagamento: 42,
                        valor_pagamento: 20,
                        status_pagamento: 'APROVADO',
                        data_hora_pagamento: '2026-11-14 10:00:00',
                        forma_pagamento: 'Pix'
                    }
                ], undefined];
            }
            if (sql.startsWith('SELECT id_forma_pagamento, descricao, valor_esperado')) return [[], undefined];
            if (sql.startsWith('SELECT COUNT(*) AS quantidade')) {
                return [[{ quantidade: 2, total: 30 }], undefined];
            }
            if (sql.startsWith('SELECT fp.id_forma_pagamento')) {
                return [[
                    { id_forma_pagamento: 1, descricao: 'Dinheiro', total_vendido: 10, quantidade_vendas: 1 },
                    { id_forma_pagamento: 2, descricao: 'Pix', total_vendido: 20, quantidade_vendas: 1 }
                ], undefined];
            }
            if (sql.startsWith('SELECT COALESCE(SUM(CASE WHEN tipo')) {
                return [[{ suprimentos: 5, sangrias: 1, despesas: 2 }], undefined];
            }
            if (sql.startsWith('INSERT INTO caixa (')) return [{ insertId: 8 }, undefined];
            if (sql.startsWith('INSERT INTO caixa_movimentacao')) return [{ insertId: 22 }, undefined];
            if (sql.startsWith('INSERT INTO caixa_fechamento (')) return [{ insertId: 12 }, undefined];
            return [{ affectedRows: 1 }, undefined];
        }
    });
});

test('abre sessão com valor e operador informados e libera o lock', async () => {
    const resultado = await CaixaModel.abrir({ valor_inicial: 80.25, id_usuario: 4 });

    assert.deepEqual(resultado, { id_caixa: 8 });
    const insert = chamadas.find(({ sql }) => sql.startsWith('INSERT INTO caixa ('));
    assert.deepEqual(insert.parametros, [80.25, 4]);
    assert.ok(chamadas.some(({ sql }) => sql.includes('GET_LOCK')));
    assert.ok(chamadas.some(({ sql }) => sql.includes('RELEASE_LOCK')));
    assert.ok(chamadas.some(({ sql }) => sql === 'COMMIT'));
});

test('recusa abertura com valor ausente antes de acessar o banco', async () => {
    await assert.rejects(CaixaModel.abrir({ valor_inicial: '', id_usuario: 4 }), {
        status: 400,
        message: /valor válido/
    });
    assert.equal(chamadas.length, 0);
});

test('impede duas sessões abertas simultaneamente', async () => {
    existeCaixaAberto = true;

    await assert.rejects(CaixaModel.abrir({ valor_inicial: 50, id_usuario: 4 }), {
        status: 409,
        message: /Já existe um caixa aberto/
    });

    assert.equal(chamadas.some(({ sql }) => sql.startsWith('INSERT INTO caixa (')), false);
    assert.ok(chamadas.some(({ sql }) => sql === 'ROLLBACK'));
    assert.ok(chamadas.some(({ sql }) => sql.includes('RELEASE_LOCK')));
});

test('exige justificativa para sangria e categoria para despesa', async () => {
    await assert.rejects(CaixaModel.registrarMovimentacao(7, {
        tipo: 'SANGRIA',
        valor: 10,
        descricao: ''
    }, 4), {
        status: 400,
        message: /descrição ou justificativa/
    });
    await assert.rejects(CaixaModel.registrarMovimentacao(7, {
        tipo: 'DESPESA',
        valor: 10,
        descricao: 'Pagamento de material'
    }, 4), {
        status: 400,
        message: /categoria/
    });
    assert.equal(chamadas.length, 0);
});

test('registra despesa no caixa aberto com categoria e operador', async () => {
    const resultado = await CaixaModel.registrarMovimentacao(7, {
        tipo: 'DESPESA',
        valor: 12.5,
        descricao: 'Compra de material',
        categoria: 'Suprimentos'
    }, 4);

    assert.deepEqual(resultado, { id_movimentacao: 22 });
    const insert = chamadas.find(({ sql }) => sql.startsWith('INSERT INTO caixa_movimentacao'));
    assert.deepEqual(insert.parametros, [7, 'DESPESA', 12.5, 'Compra de material', 'Suprimentos', 4]);
    assert.ok(chamadas.some(({ sql }) => sql === 'COMMIT'));
});

test('bloqueia movimentação após o fechamento da sessão', async () => {
    dadosCaixa.status = 'FECHADO';

    await assert.rejects(CaixaModel.registrarMovimentacao(7, {
        tipo: 'SUPRIMENTO',
        valor: 10,
        descricao: 'Reforço'
    }, 4), {
        status: 409,
        message: /caixa está fechado/
    });

    assert.equal(chamadas.some(({ sql }) => sql.startsWith('INSERT INTO caixa_movimentacao')), false);
});

test('calcula fechamento com recebimentos não monetários fora do saldo físico', async () => {
    const fechamento = await CaixaModel.fechar(7, {
        conferencias: [
            { id_forma_pagamento: 1, valor_informado: 112, valor_esperado: 112 },
            { id_forma_pagamento: 2, valor_informado: 20, valor_esperado: 20 }
        ]
    }, 4);

    assert.equal(fechamento.saldo_esperado_dinheiro, 112);
    assert.equal(fechamento.saldo_informado_dinheiro, 112);
    assert.equal(fechamento.diferenca_dinheiro, 0);
    assert.equal(fechamento.diferenca_total, 0);
    const update = chamadas.find(({ sql }) => sql.startsWith('UPDATE caixa'));
    assert.deepEqual(update.parametros, [112, 4, 7]);
    assert.equal(chamadas.filter(({ sql }) => sql.startsWith('INSERT INTO caixa_fechamento_pagamento')).length, 2);
});

test('rejeita fechamento sem conferência de todas as formas ativas', async () => {
    await assert.rejects(CaixaModel.fechar(7, {
        conferencias: [{ id_forma_pagamento: 1, valor_informado: 112, valor_esperado: 112 }]
    }, 4), {
        status: 400,
        message: /todas as formas/
    });

    assert.equal(chamadas.some(({ sql }) => sql.startsWith('UPDATE caixa')), false);
});

test('exige nova conferência se uma venda ou movimentação mudar após a revisão', async () => {
    await assert.rejects(CaixaModel.fechar(7, {
        conferencias: [
            { id_forma_pagamento: 1, valor_informado: 112, valor_esperado: 102 },
            { id_forma_pagamento: 2, valor_informado: 20, valor_esperado: 20 }
        ]
    }, 4), {
        status: 409,
        message: /mudaram durante a conferência/
    });

    assert.equal(chamadas.some(({ sql }) => sql.startsWith('UPDATE caixa')), false);
});

test('retorna vendas com pagamentos e movimentações da sessão no relatório detalhado', async () => {
    const caixa = await CaixaModel.obterDetalhes(7);

    assert.equal(caixa.vendas.length, 1);
    assert.equal(caixa.vendas[0].operador, 'Operador');
    assert.deepEqual(caixa.vendas[0].pagamentos.map(pagamento => pagamento.forma_pagamento), ['Dinheiro', 'Pix']);
    assert.equal(caixa.vendas[0].pagamentos.reduce((total, pagamento) => total + pagamento.valor, 0), 30);
    assert.equal(caixa.movimentacoes.length, 1);
    assert.equal(caixa.movimentacoes[0].responsavel, 'Operador');
    assert.equal(caixa.pagamentos[0].valor_esperado, 112);
    assert.ok(chamadas.some(({ sql }) => sql === 'COMMIT'));
});
