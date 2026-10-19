const express = require('express');
const cors = require('cors');
require('dotenv').config();

const usuarioRoutes = require('./src/routes/usuarioRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors()); // Libera o acesso para o frontend
app.use(express.json());

// Rotas da API
app.use('/api/usuarios', usuarioRoutes);

app.listen(PORT, () => {
    console.log(`Backend rodando na porta ${PORT}`);
});