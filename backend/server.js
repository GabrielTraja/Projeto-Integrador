const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Carrega variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const initDatabase = require('./src/config/initDb');
const authRoutes = require('./src/routes/authRoutes');
const usuarioRoutes = require('./src/routes/usuarioRoutes');
const produtoRoutes = require('./src/routes/produtoRoutes');
const categoriaRoutes = require('./src/routes/categoriaRoutes');
const vendaRoutes = require('./src/routes/vendaRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '7mb' }));
app.use(express.urlencoded({ extended: true }));

// Caminho da pasta frontend
const frontendPath = path.resolve(__dirname, '../frontend');

// Rota raiz: serve explicitamente a página de login como ponto de entrada principal
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'login.html'));
});

// Arquivos estáticos do frontend (CSS, JS, Imagens, Telas)
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads'), {
    fallthrough: false,
    maxAge: '1d'
}));
app.use(express.static(frontendPath));

// Rotas da API REST
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/produtos', produtoRoutes);
app.use('/api/categorias', categoriaRoutes);
app.use('/api/vendas', vendaRoutes);

// Health check
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        sistema: 'PDV - Ponto de Venda Integrado'
    });
});

// Inicialização segura do banco de dados e servidor
async function startServer() {
    try {
        await initDatabase();
        app.listen(PORT, () => {
            console.log('====================================================');
            console.log(`🚀 Servidor PDV rodando com sucesso!`);
            console.log(`🌐 Acesse no navegador: http://localhost:${PORT}`);
            console.log(`📄 Ponto de entrada: http://localhost:${PORT}/ (Login)`);
            console.log('====================================================');
        });
    } catch (error) {
        console.error('❌ Falha ao inicializar o servidor e banco de dados:', error);
        process.exit(1);
    }
}

startServer();
