const express = require('express');
const router = express.Router();
const vendaController = require('../controllers/vendaController');
const { exigirAutenticacao, exigirTipos } = require('../middleware/auth');

router.post('/', exigirAutenticacao, exigirTipos(1, 2, 3), vendaController.criar);
router.get('/recentes', exigirAutenticacao, exigirTipos(1, 2), vendaController.listarRecentes);

module.exports = router;
