const express = require('express');
const cors = require('cors');
const path = require('path');

const { uploadsDir } = require('./src/config/ambiente');

const initDatabase = require('./src/config/initDb');
const authRoutes = require('./src/routes/authRoutes');
const usuarioRoutes = require('./src/routes/usuarioRoutes');
const produtoRoutes = require('./src/routes/produtoRoutes');
const categoriaRoutes = require('./src/routes/categoriaRoutes');
const vendaRoutes = require('./src/routes/vendaRoutes');
const caixaRoutes = require('./src/routes/caixaRoutes');
const configuracaoEstabelecimentoRoutes = require('./src/routes/configuracaoEstabelecimentoRoutes');
const licencaRoutes = require('./src/routes/licencaRoutes');
const licencaService = require('./src/license/licencaService');
const { bloquearEscritaSemLicenca } = require('./src/middleware/licenca');
const { versao } = require('./src/versao');

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
app.use('/uploads', express.static(uploadsDir, {
    fallthrough: false,
    maxAge: '1d'
}));
app.use(express.static(frontendPath));

// Rotas da API REST
// Sem licença válida, a API passa a aceitar apenas consultas (modo somente leitura)
app.use('/api', bloquearEscritaSemLicenca);
app.use('/api/licenca', licencaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/produtos', produtoRoutes);
app.use('/api/categorias', categoriaRoutes);
app.use('/api/vendas', vendaRoutes);
app.use('/api/caixa', caixaRoutes);
app.use('/api/configuracoes', configuracaoEstabelecimentoRoutes);

// Health check
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        versao,
        sistema: 'PDV - Ponto de Venda Integrado'
    });
});

// Inicialização segura do banco de dados e servidor
async function startServer() {
    try {
        await initDatabase();
        await licencaService.inicializar();
        app.listen(PORT, () => {
            console.log('====================================================');
            console.log(`🚀 Servidor PDV ${versao} rodando com sucesso!`);
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
