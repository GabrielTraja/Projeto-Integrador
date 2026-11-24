const licencaService = require('../license/licencaService');

function situacaoPublica(situacao) {
    const { bloqueadoDesde, ...dados } = situacao;
    return dados;
}

const licencaController = {
    status(req, res) {
        res.json(situacaoPublica(licencaService.obterSituacao()));
    },

    async ativar(req, res) {
        try {
            const { chave } = req.body || {};
            if (typeof chave !== 'string' || !chave.trim() || chave.length > 4000) {
                return res.status(400).json({ erro: 'Informe a chave de licença.' });
            }
            const situacao = await licencaService.ativar(chave);
            res.json({ mensagem: 'Licença ativada com sucesso!', situacao: situacaoPublica(situacao) });
        } catch (erro) {
            if (erro.status) return res.status(erro.status).json({ erro: erro.message });
            console.error('Erro ao ativar licença:', erro);
            res.status(500).json({ erro: 'Erro interno ao ativar a licença.' });
        }
    }
};

module.exports = licencaController;
