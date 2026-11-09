const UsuarioModel = require('../models/usuarioModel');
const { verifyPassword, hashPassword } = require('../utils/password');
const { criarToken } = require('../middleware/auth');

const authController = {
    async login(req, res) {
        try {
            const { usuario, login, senha } = req.body;
            const identificador = usuario || login;

            if (typeof identificador !== 'string' || typeof senha !== 'string' ||
                !identificador.trim() || !senha) {
                return res.status(400).json({ erro: 'Usuário e senha são obrigatórios.' });
            }

            const user = await UsuarioModel.buscarPorLoginOuEmail(identificador.trim());

            if (!user) {
                return res.status(401).json({ erro: 'Credenciais inválidas.' });
            }

            if (!await verifyPassword(senha, user.senha)) {
                return res.status(401).json({ erro: 'Credenciais inválidas.' });
            }

            if (user.status !== 'ATIVO') {
                return res.status(403).json({ erro: 'Este usuário está inativo no sistema. Contate o administrador.' });
            }

            if (!user.senha.startsWith('scrypt$')) {
                await UsuarioModel.atualizarSenha(user.id_usuario, await hashPassword(senha));
            }

            // Retorna dados do usuário autenticado (omitindo a senha)
            const { senha: _, ...dadosUsuario } = user;

            res.json({
                sucesso: true,
                mensagem: 'Login realizado com sucesso!',
                token: criarToken(user),
                usuario: dadosUsuario
            });
        } catch (error) {
            console.error('Erro no login:', error);
            res.status(500).json({ erro: 'Erro interno ao realizar login.' });
        }
    }
};

module.exports = authController;
