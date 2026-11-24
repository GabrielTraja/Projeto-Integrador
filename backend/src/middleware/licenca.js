// ==========================================================================
// MODO SOMENTE LEITURA: sem licença válida, consultas continuam liberadas
// (login, relatórios, estoque), mas operações que gravam dados são recusadas.
// Exceção: um caixa aberto ANTES do bloqueio pode concluir vendas e ser fechado.
// ==========================================================================
const db = require('../config/database');
const licencaService = require('../license/licencaService');

const METODOS_LEITURA = ['GET', 'HEAD', 'OPTIONS'];
const ROTAS_SEMPRE_LIBERADAS = [/^\/auth\//, /^\/licenca\//];
const ROTAS_CONCLUSAO_CAIXA = [
    /^\/vendas\/?$/,
    /^\/caixa\/\d+\/movimentacoes\/?$/,
    /^\/caixa\/\d+\/fechamento\/?$/
];

async function caixaAbertoAntesDoBloqueio(bloqueadoDesde) {
    const [linhas] = await db.query(
        `SELECT data_abertura FROM caixa WHERE status = 'ABERTO' ORDER BY id_caixa DESC LIMIT 1`
    );
    return Boolean(linhas[0] && new Date(linhas[0].data_abertura) < bloqueadoDesde);
}

async function bloquearEscritaSemLicenca(req, res, next) {
    if (METODOS_LEITURA.includes(req.method)) return next();
    if (ROTAS_SEMPRE_LIBERADAS.some(rota => rota.test(req.path))) return next();

    const situacao = licencaService.obterSituacao();
    if (!situacao.somenteLeitura) return next();

    try {
        if (situacao.bloqueadoDesde && ROTAS_CONCLUSAO_CAIXA.some(rota => rota.test(req.path)) &&
            await caixaAbertoAntesDoBloqueio(situacao.bloqueadoDesde)) {
            return next();
        }
    } catch (erro) {
        return next(erro);
    }

    return res.status(403).json({
        erro: situacao.mensagem,
        codigo: 'LICENCA_BLOQUEADA',
        modo: situacao.modo
    });
}

module.exports = { bloquearEscritaSemLicenca };
