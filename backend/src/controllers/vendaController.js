const VendaModel = require('../models/vendaModel');

const vendaController = {
    async criar(req, res) {
        try {
            const { id_usuario, desconto, forma_pagamento, valor_recebido, pagamentos, observacao, itens } = req.body;

            if (!itens || !Array.isArray(itens) || itens.length === 0) {
                return res.status(400).json({ erro: 'O carrinho está vazio. Adicione itens antes de finalizar.' });
            }

            const venda = await VendaModel.criarVenda({
                id_usuario: req.usuarioAutenticado.id_usuario,
                desconto,
                forma_pagamento,
                valor_recebido,
                pagamentos,
                observacao,
                itens
            });

            res.status(201).json({
                sucesso: true,
                mensagem: 'Venda finalizada e estoque atualizado com sucesso!',
                venda
            });
        } catch (erro) {
            console.error('Erro ao finalizar venda:', erro.message);
            res.status(erro.status || 500).json({ erro: erro.message || 'Erro ao processar a venda.' });
        }
    },

    async listarRecentes(req, res) {
        try {
            const limite = req.query.limite === undefined ? 10 : req.query.limite;
            if (typeof limite !== 'string' && typeof limite !== 'number') {
                return res.status(400).json({ erro: 'O limite deve ser um inteiro entre 1 e 100.' });
            }
            if (!/^\d+$/.test(String(limite)) || Number(limite) < 1 || Number(limite) > 100) {
                return res.status(400).json({ erro: 'O limite deve ser um inteiro entre 1 e 100.' });
            }
            const vendas = await VendaModel.listarVendasRecentes(limite);
            res.json(vendas);
        } catch (erro) {
            console.error('Erro ao listar vendas:', erro);
            res.status(erro.status || 500).json({ erro: erro.status === 400 ? erro.message : 'Erro ao listar vendas recentes.' });
        }
    }
};

module.exports = vendaController;
