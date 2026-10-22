const UsuarioModel = require('../models/usuarioModel');

const authController = {
    async login(req, res) {
        try {
            const { usuario, login, senha } = req.body;
            const identificador = usuario || login;

            if (!identificador || !senha) {
                return res.status(400).json({ erro: 'Usuário e senha são obrigatórios.' });
            }

            const user = await UsuarioModel.buscarPorLoginOuEmail(identificador.trim());

            if (!user) {
                return res.status(401).json({ erro: 'Credenciais inválidas: usuário não encontrado.' });
            }

            if (user.senha !== senha) {
                return res.status(401).json({ erro: 'Credenciais inválidas: senha incorreta.' });
            }

            if (user.status !== 'ATIVO') {
                return res.status(403).json({ erro: 'Este usuário está inativo no sistema. Contate o administrador.' });
            }

            // Retorna dados do usuário autenticado (omitindo a senha)
            const { senha: _, ...dadosUsuario } = user;

            res.json({
                sucesso: true,
                mensagem: 'Login realizado com sucesso!',
                usuario: dadosUsuario
            });
        } catch (error) {
            console.error('Erro no login:', error);
            res.status(500).json({ erro: 'Erro interno ao realizar login.' });
        }
    }
};

module.exports = authController;

