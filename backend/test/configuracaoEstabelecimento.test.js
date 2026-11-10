const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validarConfiguracao } = require('../src/controllers/configuracaoEstabelecimentoController');

function configuracaoValida() {
    return {
        nome_fantasia: 'Loja Exemplo',
        razao_social: 'Loja Exemplo LTDA',
        cnpj: '12.345.678/0001-95',
        inscricao_estadual: '',
        telefone: '(11) 99999-9999',
        email: 'contato@loja.com.br',
        cep: '01001-000',
        endereco: 'Rua Exemplo',
        numero: '10',
        complemento: '',
        bairro: 'Centro',
        cidade: 'São Paulo',
        estado: 'sp',
        logotipo: '',
        rede_social: '@loja',
        mensagem_agradecimento: 'Obrigado pela preferência!',
        largura_papel: '58',
        exibir_logotipo: true,
        exibir_cnpj: true,
        exibir_endereco: true,
        exibir_telefone: true,
        exibir_operador: true,
        exibir_numero_venda: true,
        exibir_data_horario: true,
        exibir_forma_pagamento: true,
        exibir_valor_recebido: true,
        exibir_troco: true,
        mensagem_rodape: 'Volte sempre.',
        quantidade_vias: '2'
    };
}

test('valida e normaliza os dados do estabelecimento e as opções de impressão', () => {
    const resultado = validarConfiguracao(configuracaoValida());

    assert.equal(resultado.erro, undefined);
    assert.equal(resultado.configuracao.cnpj, '12.345.678/0001-95');
    assert.equal(resultado.configuracao.cep, '01001-000');
    assert.equal(resultado.configuracao.estado, 'SP');
    assert.equal(resultado.configuracao.largura_papel, 58);
    assert.equal(resultado.configuracao.quantidade_vias, 2);
    assert.equal(resultado.configuracao.exibir_logotipo, 1);
});

test('rejeita CNPJ e e-mail inválidos', () => {
    const cnpjInvalido = validarConfiguracao({ ...configuracaoValida(), cnpj: '123' });
    assert.match(cnpjInvalido.erro, /CNPJ/);

    const emailInvalido = validarConfiguracao({ ...configuracaoValida(), email: 'invalido' });
    assert.match(emailInvalido.erro, /e-mail/);
});

test('rejeita largura de papel e número de vias não suportados', () => {
    const larguraInvalida = validarConfiguracao({ ...configuracaoValida(), largura_papel: '76' });
    assert.match(larguraInvalida.erro, /largura/);

    const viasInvalidas = validarConfiguracao({ ...configuracaoValida(), quantidade_vias: '6' });
    assert.match(viasInvalidas.erro, /vias/);
});

test('preserva o logotipo salvo quando nenhum arquivo novo é enviado', () => {
    const logo = '/uploads/123e4567-e89b-12d3-a456-426614174000.png';
    const resultado = validarConfiguracao({ ...configuracaoValida(), logotipo: undefined }, logo);

    assert.equal(resultado.configuracao.logotipo, logo);
});
