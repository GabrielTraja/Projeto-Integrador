const express = require('express');
const router = express.Router();
const licencaController = require('../controllers/licencaController');

// Rotas públicas: a tela de login também precisa exibir a situação da
// licença e permitir colar a chave. Só chaves assinadas por você e emitidas
// para o código desta máquina são aceitas.
router.get('/status', licencaController.status);
router.post('/ativar', licencaController.ativar);

module.exports = router;
