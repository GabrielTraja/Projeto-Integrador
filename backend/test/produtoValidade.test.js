const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validarProduto } = require('../src/controllers/produtoController');

const base = { nome: 'Croissant', preco_venda: 14 };

test('produto não perecível ignora a data de validade', () => {
    const { valores, erro } = validarProduto({ ...base, perecivel: false, data_validade: '2026-12-01' });
    assert.equal(erro, undefined);
    assert.equal(valores.perecivel, false);
    assert.equal(valores.data_validade, null);
});

test('produto perecível exige data de validade válida', () => {
    assert.match(validarProduto({ ...base, perecivel: true }).erro, /obrigatória/);
    assert.match(validarProduto({ ...base, perecivel: true, data_validade: '2026-02-30' }).erro, /inválida/);
    assert.match(validarProduto({ ...base, perecivel: true, data_validade: '01/12/2026' }).erro, /inválida/);
    assert.match(validarProduto({ ...base, perecivel: 'talvez' }).erro, /perecível inválida/);

    const { valores } = validarProduto({ ...base, perecivel: true, data_validade: '2026-12-01' });
    assert.equal(valores.perecivel, true);
    assert.equal(valores.data_validade, '2026-12-01');
});

test('edição mantém perecível e validade existentes quando não informados', () => {
    const atual = { ...base, perecivel: 1, data_validade: '2026-11-20' };
    const { valores } = validarProduto({ preco_venda: 15 }, atual);
    assert.equal(valores.perecivel, true);
    assert.equal(valores.data_validade, '2026-11-20');
});
