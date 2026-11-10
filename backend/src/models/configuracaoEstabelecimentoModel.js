const db = require('../config/database');

const campos = [
    'nome_fantasia',
    'razao_social',
    'cnpj',
    'inscricao_estadual',
    'telefone',
    'email',
    'cep',
    'endereco',
    'numero',
    'complemento',
    'bairro',
    'cidade',
    'estado',
    'logotipo',
    'rede_social',
    'mensagem_agradecimento',
    'largura_papel',
    'exibir_logotipo',
    'exibir_cnpj',
    'exibir_endereco',
    'exibir_telefone',
    'exibir_operador',
    'exibir_numero_venda',
    'exibir_data_horario',
    'exibir_forma_pagamento',
    'exibir_valor_recebido',
    'exibir_troco',
    'mensagem_rodape',
    'quantidade_vias'
];

const padrao = {
    id_configuracao: 1,
    ...Object.fromEntries(campos.map(campo => [campo, ''])),
    logotipo: null,
    largura_papel: 80,
    quantidade_vias: 1,
    ...Object.fromEntries([
        'exibir_logotipo',
        'exibir_cnpj',
        'exibir_endereco',
        'exibir_telefone',
        'exibir_operador',
        'exibir_numero_venda',
        'exibir_data_horario',
        'exibir_forma_pagamento',
        'exibir_valor_recebido',
        'exibir_troco'
    ].map(campo => [campo, 1]))
};

const ConfiguracaoEstabelecimentoModel = {
    async obter() {
        const [linhas] = await db.query(
            'SELECT * FROM configuracao_estabelecimento WHERE id_configuracao = 1'
        );
        return linhas[0] || { ...padrao };
    },

    async salvar(configuracao) {
        const colunas = campos.join(', ');
        const placeholders = campos.map(() => '?').join(', ');
        const atualizacoes = campos.map(campo => `${campo} = VALUES(${campo})`).join(', ');
        const valores = campos.map(campo => configuracao[campo] ?? null);
        await db.query(`
            INSERT INTO configuracao_estabelecimento (id_configuracao, ${colunas})
            VALUES (1, ${placeholders})
            ON DUPLICATE KEY UPDATE ${atualizacoes}
        `, valores);
        return this.obter();
    }
};

module.exports = ConfiguracaoEstabelecimentoModel;
