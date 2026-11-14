const CaixaModel = require('../models/caixaModel');

function responderErro(res, erro, mensagemPadrao) {
    console.error(`${mensagemPadrao}:`, erro.message);
    res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : mensagemPadrao
    });
}

const caixaController = {
    async formasPagamento(req, res) {
        try {
            res.json(await CaixaModel.listarFormasPagamento());
        } catch (erro) {
            responderErro(res, erro, 'Erro ao consultar as formas de pagamento.');
        }
    },

    async atual(req, res) {
        try {
            res.json(await CaixaModel.obterAtual());
        } catch (erro) {
            responderErro(res, erro, 'Erro ao consultar o caixa atual.');
        }
    },

    async abrir(req, res) {
        try {
            const caixa = await CaixaModel.abrir({
                valor_inicial: req.body.valor_inicial,
                id_usuario: req.usuarioAutenticado.id_usuario
            });
            res.status(201).json({ sucesso: true, caixa });
        } catch (erro) {
            responderErro(res, erro, 'Erro ao abrir o caixa.');
        }
    },

    async listarMovimentacoes(req, res) {
        try {
            const movimentacoes = await CaixaModel.listarMovimentacoes(req.params.id, {
                tipo: req.query.tipo,
                inicio: req.query.inicio,
                fim: req.query.fim
            });
            res.json(movimentacoes);
        } catch (erro) {
            responderErro(res, erro, 'Erro ao consultar as movimentações do caixa.');
        }
    },

    async registrarMovimentacao(req, res) {
        try {
            const movimentacao = await CaixaModel.registrarMovimentacao(
                req.params.id,
                req.body,
                req.usuarioAutenticado.id_usuario
            );
            res.status(201).json({ sucesso: true, movimentacao });
        } catch (erro) {
            responderErro(res, erro, 'Erro ao registrar a movimentação.');
        }
    },

    async fechar(req, res) {
        try {
            const fechamento = await CaixaModel.fechar(
                req.params.id,
                req.body,
                req.usuarioAutenticado.id_usuario
            );
            res.json({ sucesso: true, fechamento });
        } catch (erro) {
            responderErro(res, erro, 'Erro ao fechar o caixa.');
        }
    },

    async historico(req, res) {
        try {
            res.json(await CaixaModel.listarHistorico());
        } catch (erro) {
            responderErro(res, erro, 'Erro ao consultar o histórico de caixas.');
        }
    },

    async detalhes(req, res) {
        try {
            res.json(await CaixaModel.obterDetalhes(req.params.id));
        } catch (erro) {
            responderErro(res, erro, 'Erro ao consultar os detalhes do caixa.');
        }
    }
};

module.exports = caixaController;
