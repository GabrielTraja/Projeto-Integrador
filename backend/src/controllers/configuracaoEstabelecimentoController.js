const ConfiguracaoEstabelecimentoModel = require('../models/configuracaoEstabelecimentoModel');
const { salvarImagemProduto, removerImagemProduto } = require('../utils/productImage');

const limitesTexto = {
    nome_fantasia: 120,
    razao_social: 160,
    cnpj: 18,
    inscricao_estadual: 30,
    telefone: 30,
    email: 120,
    cep: 9,
    endereco: 160,
    numero: 20,
    complemento: 100,
    bairro: 100,
    cidade: 100,
    estado: 2,
    rede_social: 120,
    mensagem_agradecimento: 255,
    mensagem_rodape: 255
};

const camposBooleanos = [
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
];

function validarConfiguracao(dados, logotipoAtual = null) {
    const configuracao = {};
    for (const [campo, limite] of Object.entries(limitesTexto)) {
        const valor = dados[campo] ?? '';
        if (typeof valor !== 'string' || valor.trim().length > limite) {
            return { erro: `${campo} deve ser um texto com até ${limite} caracteres.` };
        }
        configuracao[campo] = valor.trim();
    }

    if (!configuracao.nome_fantasia) {
        return { erro: 'Nome fantasia é obrigatório.' };
    }
    if (!/^\d{14}$/.test(configuracao.cnpj.replace(/\D/g, ''))) {
        return { erro: 'CNPJ deve conter 14 dígitos.' };
    }
    if (configuracao.cep && !/^\d{8}$/.test(configuracao.cep.replace(/\D/g, ''))) {
        return { erro: 'CEP deve conter 8 dígitos.' };
    }
    if (configuracao.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuracao.email)) {
        return { erro: 'Informe um e-mail válido.' };
    }
    if (configuracao.estado && !/^[a-z]{2}$/i.test(configuracao.estado)) {
        return { erro: 'Estado deve ser informado com a sigla de 2 letras.' };
    }
    configuracao.cnpj = formatarDocumento(configuracao.cnpj, '##.###.###/####-##');
    configuracao.cep = formatarDocumento(configuracao.cep, '#####-###');
    configuracao.estado = configuracao.estado.toUpperCase();

    const largura = Number(dados.largura_papel);
    if (![58, 80].includes(largura)) {
        return { erro: 'A largura do papel deve ser 58 mm ou 80 mm.' };
    }
    configuracao.largura_papel = largura;

    for (const campo of camposBooleanos) {
        const valor = dados[campo];
        if (![true, false, 0, 1, '0', '1'].includes(valor)) {
            return { erro: `A opção ${campo} é inválida.` };
        }
        configuracao[campo] = valor === true || Number(valor) === 1 ? 1 : 0;
    }

    const vias = Number(dados.quantidade_vias);
    if (!Number.isInteger(vias) || vias < 1 || vias > 5) {
        return { erro: 'A quantidade de vias deve estar entre 1 e 5.' };
    }
    configuracao.quantidade_vias = vias;

    const logotipo = dados.logotipo ?? logotipoAtual ?? '';
    if (typeof logotipo !== 'string') {
        return { erro: 'O logotipo informado é inválido.' };
    }
    if (logotipo.startsWith('data:')) {
        configuracao.logotipo = logotipo;
    } else if (!logotipo || logotipo === logotipoAtual) {
        configuracao.logotipo = logotipo || null;
    } else {
        return { erro: 'Envie uma imagem de logotipo válida.' };
    }

    return { configuracao };
}

function formatarDocumento(valor, mascara) {
    const digitos = valor.replace(/\D/g, '');
    if (!digitos) return '';
    let indice = 0;
    return mascara.replace(/#/g, () => digitos[indice++] || '');
}

const configuracaoEstabelecimentoController = {
    async obter(req, res) {
        try {
            res.json(await ConfiguracaoEstabelecimentoModel.obter());
        } catch (erro) {
            console.error('Erro ao carregar configuração do estabelecimento:', erro);
            res.status(500).json({ erro: 'Erro ao carregar os dados do estabelecimento.' });
        }
    },

    async salvar(req, res) {
        let logotipoSalvo;
        let configuracaoSalva = false;
        try {
            const atual = await ConfiguracaoEstabelecimentoModel.obter();
            const dados = { ...req.body };
            const validacao = validarConfiguracao(dados, atual.logotipo);
            if (validacao.erro) {
                return res.status(400).json({ erro: validacao.erro });
            }

            if (validacao.configuracao.logotipo?.startsWith('data:')) {
                logotipoSalvo = await salvarImagemProduto(validacao.configuracao.logotipo);
                validacao.configuracao.logotipo = logotipoSalvo;
            }

            const configuracao = await ConfiguracaoEstabelecimentoModel.salvar(validacao.configuracao);
            configuracaoSalva = true;
            if (atual.logotipo && atual.logotipo !== configuracao.logotipo) {
                await removerImagemProduto(atual.logotipo).catch(erroLimpeza => {
                    console.error('Erro ao remover o logotipo substituído:', erroLimpeza);
                });
            }
            res.json({ mensagem: 'Configurações salvas com sucesso.', configuracao });
        } catch (erro) {
            if (logotipoSalvo && !configuracaoSalva) {
                await removerImagemProduto(logotipoSalvo).catch(erroLimpeza => {
                    console.error('Erro ao limpar o novo logotipo após falha:', erroLimpeza);
                });
            }
            console.error('Erro ao salvar configuração do estabelecimento:', erro);
            res.status(erro.status || 500).json({
                erro: erro.status ? erro.message : 'Erro ao salvar os dados do estabelecimento.'
            });
        }
    }
};

module.exports = { ...configuracaoEstabelecimentoController, validarConfiguracao };
