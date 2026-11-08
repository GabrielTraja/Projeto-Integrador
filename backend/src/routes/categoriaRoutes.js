const express = require('express');
const router = express.Router();
const categoriaController = require('../controllers/categoriaController');
const { exigirAutenticacao, exigirTipos } = require('../middleware/auth');

router.get('/', exigirAutenticacao, categoriaController.listar);
router.post('/', exigirAutenticacao, exigirTipos(1, 2), categoriaController.criar);

module.exports = router;
