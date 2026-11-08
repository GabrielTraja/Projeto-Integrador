const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');
const { exigirAutenticacao, exigirTipos } = require('../middleware/auth');

// Rotas de Usuários
router.get('/tipos', exigirAutenticacao, exigirTipos(1), usuarioController.listarTipos);
router.get('/', exigirAutenticacao, exigirTipos(1, 2), usuarioController.listar);
router.get('/:id', exigirAutenticacao, exigirTipos(1), usuarioController.buscarPorId);
router.post('/', exigirAutenticacao, exigirTipos(1), usuarioController.criar);
router.put('/:id', exigirAutenticacao, exigirTipos(1), usuarioController.atualizar);
router.delete('/:id', exigirAutenticacao, exigirTipos(1), usuarioController.deletar);

module.exports = router;
