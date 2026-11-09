const express = require('express');
const router = express.Router();
const produtoController = require('../controllers/produtoController');
const { exigirAutenticacao, exigirTipos } = require('../middleware/auth');

// Rotas de Produtos
router.get('/', exigirAutenticacao, produtoController.listar);
router.get('/:id', exigirAutenticacao, produtoController.buscarPorId);
router.post('/', exigirAutenticacao, exigirTipos(1, 2, 4), produtoController.criar);
router.put('/:id', exigirAutenticacao, exigirTipos(1, 2, 4), produtoController.atualizar);
router.delete('/:id', exigirAutenticacao, exigirTipos(1, 2, 4), produtoController.deletar);

module.exports = router;
