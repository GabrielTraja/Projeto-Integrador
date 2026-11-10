const express = require('express');
const router = express.Router();
const configuracaoController = require('../controllers/configuracaoEstabelecimentoController');
const { exigirAutenticacao, exigirTipos } = require('../middleware/auth');

router.get('/estabelecimento', exigirAutenticacao, configuracaoController.obter);
router.put('/estabelecimento', exigirAutenticacao, exigirTipos(1, 2), configuracaoController.salvar);

module.exports = router;
