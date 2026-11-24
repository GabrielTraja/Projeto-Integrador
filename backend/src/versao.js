// Versão do sistema e data de lançamento.
// Atualize LANCAMENTO a cada nova versão distribuída: licenças cujo
// "atualizacoes_ate" seja anterior a esta data não liberam esta versão.
const { version } = require('../package.json');

module.exports = {
    versao: version,
    lancamento: '2026-11-17'
};
