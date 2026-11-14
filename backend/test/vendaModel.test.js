const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const db = require('../src/config/database');
const VendaModel = require('../src/models/vendaModel');

let chamadas;
let estoqueAtual;
let existeCaixaAberto;

beforeEach(() => {
    chamadas = [];
    estoqueAtual = 10;
    existeCaixaAberto = true;

    db.getConnection = async () => ({
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
        query: async (consulta, parametros = []) => {
            const sql = consulta.replace(/\s+/g, ' ').trim();
            chamadas.push({ sql, parametros });

            if (sql.startsWith('SELECT id_caixa FROM caixa')) {
                return [existeCaixaAberto ? [{ id_caixa: 3 }] : [], undefined];
            }
            if (sql.startsWith('SELECT id_produto, nome, preco_venda')) {
                return [[{
                    id_produto: 1,
                    nome: 'Produto de teste',
                    preco_venda: 10,
                    estoque_atual: estoqueAtual,
                    unidade_medida: 'UN',
                    status: 'ATIVO'
                }], undefined];
            }
            if (sql.startsWith('SELECT id_forma_pagamento, descricao FROM forma_pagamento')) {
                const formas = {
                    Dinheiro: { id_forma_pagamento: 1, descricao: 'Dinheiro' },
                    Pix: { id_forma_pagamento: 2, descricao: 'Pix' },
                    'Cartão de Débito': { id_forma_pagamento: 3, descricao: 'Cartão de Débito' },
                    'Cartão de Crédito': { id_forma_pagamento: 4, descricao: 'Cartão de Crédito' },
                    'Vale-Refeição': { id_forma_pagamento: 5, descricao: 'Vale-Refeição' }
                };
                return [[formas[parametros[0]]], undefined];
            }
            if (sql.startsWith('INSERT INTO venda')) {
                return [{ insertId: 42 }, undefined];
            }
            if (sql.startsWith('UPDATE produto')) {
                estoqueAtual -= parametros[0];
                return [{ affectedRows: 1 }, undefined];
            }
            return [{ affectedRows: 1 }, undefined];
        }
    });
});

function venda({ forma_pagamento = 'Dinheiro', valor_recebido = 20 } = {}) {
    return VendaModel.criarVenda({
        id_usuario: 5,
        forma_pagamento,
        valor_recebido,
        itens: [{ id_produto: 1, quantidade: 2 }]
    });
}

test('finaliza venda em dinheiro, calcula troco e registra entrada líquida no caixa', async () => {
    const resultado = await venda({ valor_recebido: 25 });

    assert.equal(resultado.valor_total, 20);
    assert.equal(resultado.valor_recebido, 25);
    assert.equal(resultado.troco, 5);
    assert.equal(estoqueAtual, 8);

    const movimento = chamadas.find(({ sql }) => sql.startsWith('INSERT INTO movimentacao_caixa'));
    assert.ok(movimento);
    assert.deepEqual(movimento.parametros.slice(0, 5), [3, 42, 5, 1, 20]);
});

test('rejeita pagamento em dinheiro insuficiente sem inserir a venda', async () => {
    await assert.rejects(venda({ valor_recebido: 19.99 }), {
        status: 400,
        message: /não pode ser menor/
    });
    assert.equal(chamadas.some(({ sql }) => sql.startsWith('INSERT INTO venda')), false);
    assert.equal(estoqueAtual, 10);
});

test('impede venda quando não existe uma sessão de caixa aberta', async () => {
    existeCaixaAberto = false;

    await assert.rejects(venda(), {
        status: 409,
        message: /Abra o caixa/
    });

    assert.equal(chamadas.some(({ sql }) => sql.startsWith('INSERT INTO caixa')), false);
    assert.equal(chamadas.some(({ sql }) => sql.startsWith('INSERT INTO venda')), false);
    assert.equal(estoqueAtual, 10);
});

test('aceita PIX somente pelo valor exato e não calcula troco', async () => {
    const resultado = await venda({ forma_pagamento: 'Pix', valor_recebido: 20 });

    assert.equal(resultado.troco, 0);
    assert.equal(resultado.valor_recebido, 20);
    assert.ok(chamadas.some(({ sql }) => sql.startsWith('INSERT INTO movimentacao_caixa')));
});

test('aceita outras formas de pagamento ativas cadastradas no banco', async () => {
    const resultado = await venda({ forma_pagamento: 'Vale-Refeição', valor_recebido: 20 });

    assert.equal(resultado.pagamentos[0].forma_pagamento, 'Vale-Refeição');
    const movimento = chamadas.find(({ sql }) => sql.startsWith('INSERT INTO movimentacao_caixa'));
    assert.equal(movimento.parametros[3], 5);
});

test('aceita cartões pelo valor exato e rejeita valor divergente', async () => {
    const debito = await venda({ forma_pagamento: 'Cartão de Débito', valor_recebido: 20 });
    const credito = await venda({ forma_pagamento: 'Cartão de Crédito', valor_recebido: 20 });
    assert.equal(debito.troco, 0);
    assert.equal(credito.troco, 0);

    await assert.rejects(
        venda({ forma_pagamento: 'Cartão de Crédito', valor_recebido: 21 }),
        { status: 400, message: /igual ao total/ }
    );
});

test('registra pagamento combinado em dinheiro e PIX com duas entradas de caixa', async () => {
    const resultado = await VendaModel.criarVenda({
        id_usuario: 5,
        valor_recebido: 8,
        pagamentos: [
            { forma_pagamento: 'Dinheiro', valor: 8 },
            { forma_pagamento: 'Pix', valor: 12 }
        ],
        itens: [{ id_produto: 1, quantidade: 2 }]
    });

    assert.equal(resultado.valor_total, 20);
    assert.equal(resultado.troco, 0);
    assert.deepEqual(resultado.pagamentos, [
        { forma_pagamento: 'Dinheiro', valor: 8 },
        { forma_pagamento: 'Pix', valor: 12 }
    ]);
    assert.equal(chamadas.filter(({ sql }) => sql.startsWith('INSERT INTO pagamento')).length, 2);
    assert.equal(chamadas.filter(({ sql }) => sql.startsWith('INSERT INTO movimentacao_caixa')).length, 2);
});

test('aceita pagamentos combinados entre quaisquer duas formas diferentes', async () => {
    const formas = ['Dinheiro', 'Pix', 'Cartão de Débito', 'Cartão de Crédito'];
    const combinacoes = formas.flatMap((primeira, indice) =>
        formas.slice(indice + 1).map(segunda => [primeira, segunda])
    );

    for (const [primeira, segunda] of combinacoes) {
        estoqueAtual = 10;
        const resultado = await VendaModel.criarVenda({
            id_usuario: 5,
            valor_recebido: 8,
            pagamentos: [
                { forma_pagamento: primeira, valor: 8 },
                { forma_pagamento: segunda, valor: 12 }
            ],
            itens: [{ id_produto: 1, quantidade: 2 }]
        });

        assert.deepEqual(resultado.pagamentos.map(pagamento => pagamento.forma_pagamento), [primeira, segunda]);
    }
});

test('registra pagamentos em várias etapas e permite reutilizar uma forma de pagamento', async () => {
    const resultado = await VendaModel.criarVenda({
        id_usuario: 5,
        valor_recebido: 5,
        pagamentos: [
            { forma_pagamento: 'Dinheiro', valor: 5 },
            { forma_pagamento: 'Pix', valor: 5 },
            { forma_pagamento: 'Cartão de Débito', valor: 5 },
            { forma_pagamento: 'Pix', valor: 5 }
        ],
        itens: [{ id_produto: 1, quantidade: 2 }]
    });

    assert.equal(resultado.pagamentos.length, 4);
    assert.equal(resultado.pagamentos.reduce((total, pagamento) => total + pagamento.valor, 0), 20);
    assert.equal(chamadas.filter(({ sql }) => sql.startsWith('INSERT INTO pagamento')).length, 4);
    const movimentos = chamadas.filter(({ sql }) => sql.startsWith('INSERT INTO movimentacao_caixa'));
    assert.equal(movimentos.length, 3);
    assert.equal(movimentos.find(({ parametros }) => parametros[3] === 2).parametros[4], 10);
});

test('rejeita pagamento combinado cuja soma não cobre exatamente o total', async () => {
    await assert.rejects(VendaModel.criarVenda({
        id_usuario: 5,
        valor_recebido: 8,
        pagamentos: [
            { forma_pagamento: 'Dinheiro', valor: 8 },
            { forma_pagamento: 'Pix', valor: 11.99 }
        ],
        itens: [{ id_produto: 1, quantidade: 2 }]
    }), {
        status: 400,
        message: /soma dos pagamentos/
    });
    assert.equal(chamadas.some(({ sql }) => sql.startsWith('INSERT INTO venda')), false);
});
