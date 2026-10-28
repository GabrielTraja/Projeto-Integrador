const express = require('express');
const router = express.Router();
const vendaController = require('../controllers/vendaController');

router.post('/', vendaController.criar);
router.get('/recentes', vendaController.listarRecentes);

module.exports = router;

