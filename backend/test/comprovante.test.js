const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function carregarComprovante() {
    let html = '';
    const janelaComprovante = {
        document: {
            images: [],
            open() {},
            write(conteudo) { html = conteudo; },
            close() {}
        },
        addEventListener() {},
        focus() {},
        print() {}
    };
    const contexto = {
        window: { open: () => janelaComprovante },
        Array,
        Number,
        String,
        Date
    };
    const arquivo = path.resolve(__dirname, '../../frontend/js/comprovante.js');
    vm.runInNewContext(fs.readFileSync(arquivo, 'utf8'), contexto);
    return { comprovante: contexto.window.comprovante, obterHtml: () => html };
}

test('gera comprovante não fiscal com os dados reais da venda e sem conteúdo demonstrativo', () => {
    const { comprovante, obterHtml } = carregarComprovante();
    const configuracao = {
        nome_fantasia: 'Mercado <Central>',
        razao_social: 'Mercado Central LTDA',
        cnpj: '12.345.678/0001-95',
        telefone: '(11) 99999-9999',
        largura_papel: 58,
        quantidade_vias: 1,
        exibir_cnpj: 1,
        exibir_endereco: 1,
        exibir_telefone: 1,
        exibir_operador: 1,
        exibir_numero_venda: 1,
        exibir_data_horario: 1,
        exibir_forma_pagamento: 1,
        exibir_valor_recebido: 1,
        exibir_troco: 1
    };
    const venda = {
        id_venda: 42,
        data_hora: '2026-11-10T12:00:00.000Z',
        operador: 'Operador',
        itens: [{ nome: 'Produto', quantidade: 2, preco_unitario: 10, subtotal: 20 }],
        desconto: 0,
        valor_total: 20,
        valor_recebido: 25,
        troco: 5,
        pagamentos: [{ forma_pagamento: 'Dinheiro', valor: 20 }]
    };

    assert.equal(comprovante.abrir(configuracao, venda, 'venda'), true);
    const html = obterHtml();
    assert.match(html, /COMPROVANTE NÃO FISCAL/);
    assert.match(html, /Mercado &lt;Central&gt;/);
    assert.match(html, /Venda/);
    assert.match(html, /Operador/);
    assert.match(html, /R\$[\s\u00a0]25,00/);
    assert.match(html, /R\$[\s\u00a0]5,00/);
    assert.doesNotMatch(html, /DADOS DEMONSTRATIVOS/);
    assert.match(html, /58mm/);
});

test('marca prévias e testes como demonstrativos', () => {
    const { comprovante, obterHtml } = carregarComprovante();
    comprovante.abrir({ largura_papel: 80 }, { itens: [], valor_total: 0 }, 'previa');

    assert.match(obterHtml(), /PRÉVIA DE TESTE — DADOS DEMONSTRATIVOS/);
    assert.match(obterHtml(), /80mm/);
});
