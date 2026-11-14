const express = require('express');
const router = express.Router();
const caixaController = require('../controllers/caixaController');
const { exigirAutenticacao, exigirTipos } = require('../middleware/auth');

router.use(exigirAutenticacao, exigirTipos(1, 2, 3));
router.get('/formas-pagamento', caixaController.formasPagamento);
router.get('/atual', caixaController.atual);
router.get('/historico', caixaController.historico);
router.post('/abertura', caixaController.abrir);
router.get('/:id/movimentacoes', caixaController.listarMovimentacoes);
router.post('/:id/movimentacoes', caixaController.registrarMovimentacao);
router.post('/:id/fechamento', caixaController.fechar);
router.get('/:id', caixaController.detalhes);

module.exports = router;
