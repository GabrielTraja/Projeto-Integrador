const UsuarioModel = require('../models/usuarioModel');
const { hashPassword } = require('../utils/password');

const usuarioController = {
    async listar(req, res) {
        try {
            const { busca, tipo } = req.query;
            const usuarios = await UsuarioModel.listarTodos(busca, tipo);
            res.json(usuarios);
        } catch (error) {
            console.error('Erro ao listar usuários:', error);
            res.status(500).json({ erro: 'Erro interno ao listar usuários.' });
        }
    },

    async buscarPorId(req, res) {
        try {
            const { id } = req.params;
            const usuario = await UsuarioModel.buscarPorId(id);
            if (!usuario) {
                return res.status(404).json({ erro: 'Usuário não encontrado.' });
            }
            res.json(usuario);
        } catch (error) {
            console.error('Erro ao buscar usuário por ID:', error);
            res.status(500).json({ erro: 'Erro ao buscar usuário.' });
        }
    },

    async criar(req, res) {
        try {
            const { nome, cpf, login, email, telefone, senha, status, id_tipo_usuario } = req.body;

            if (typeof nome !== 'string' || typeof login !== 'string' ||
                typeof senha !== 'string' || !nome.trim() || !login.trim() || !senha) {
                return res.status(400).json({ erro: 'Nome, login e senha são obrigatórios.' });
            }

            // Verifica duplicidade de login
            const existente = await UsuarioModel.buscarPorLoginOuEmail(login);
            if (existente) {
                return res.status(409).json({ erro: 'Já existe um usuário com este login.' });
            }

            const novoUsuario = await UsuarioModel.criar({
                nome,
                cpf,
                login,
                email,
                telefone,
                senha: await hashPassword(senha),
                status: req.usuarioAutenticado?.id_tipo_usuario === 1 ? (status || 'ATIVO') : 'ATIVO',
                id_tipo_usuario: req.usuarioAutenticado?.id_tipo_usuario === 1
                    ? (Number(id_tipo_usuario) || 3)
                    : 3
            });

            res.status(201).json({
                mensagem: 'Usuário criado com sucesso!',
                usuario: novoUsuario
            });
        } catch (error) {
            console.error('Erro ao cadastrar usuário:', error);
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ erro: 'Login ou e-mail já cadastrado.' });
            }
            res.status(500).json({ erro: 'Erro ao cadastrar usuário.' });
        }
    },

    async atualizar(req, res) {
        try {
            const { id } = req.params;
            const { nome, cpf, login, email, telefone, senha, status, id_tipo_usuario } = req.body;

            if (!nome || !login) {
                return res.status(400).json({ erro: 'Nome e login são obrigatórios.' });
            }
            if (senha !== undefined && typeof senha !== 'string') {
                return res.status(400).json({ erro: 'A senha deve ser um texto válido.' });
            }

            const usuarioAtual = await UsuarioModel.buscarPorId(id);
            if (!usuarioAtual) {
                return res.status(404).json({ erro: 'Usuário não encontrado.' });
            }

            // Se o login mudou, verifica duplicidade
            if (login !== usuarioAtual.login) {
                const existente = await UsuarioModel.buscarPorLoginOuEmail(login);
                if (existente && existente.id_usuario !== Number(id)) {
                    return res.status(409).json({ erro: 'Este login já está em uso por outro usuário.' });
                }
            }

            const sucesso = await UsuarioModel.atualizar(id, {
                nome,
                cpf,
                login,
                email,
                telefone,
                senha: senha && senha.trim() ? await hashPassword(senha) : null,
                status: status !== undefined ? status : usuarioAtual.status,
                id_tipo_usuario: Number(id_tipo_usuario) || usuarioAtual.id_tipo_usuario
            });

            if (sucesso) {
                res.json({ mensagem: 'Usuário atualizado com sucesso!' });
            } else {
                res.status(400).json({ erro: 'Não foi possível atualizar o usuário.' });
            }
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ erro: 'Login ou e-mail já cadastrado.' });
            }
            res.status(500).json({ erro: 'Erro ao atualizar usuário.' });
        }
    },

    async deletar(req, res) {
        try {
            const { id } = req.params;
            const sucesso = await UsuarioModel.deletar(id);
            if (!sucesso) {
                return res.status(404).json({ erro: 'Usuário não encontrado ou já deletado.' });
            }
            res.json({ mensagem: 'Usuário deletado com sucesso!' });
        } catch (error) {
            console.error('Erro ao deletar usuário:', error);
            if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                return res.status(400).json({
                    erro: 'Não é possível excluir este usuário pois ele possui vendas ou caixas vinculados. Altere seu status para INATIVO.'
                });
            }
            res.status(500).json({ erro: 'Erro ao deletar usuário.' });
        }
    },

    async listarTipos(req, res) {
        try {
            const tipos = await UsuarioModel.listarTipos();
            res.json(tipos);
        } catch (error) {
            console.error('Erro ao listar tipos de usuário:', error);
            res.status(500).json({ erro: 'Erro ao listar perfis de usuário.' });
        }
    }
};

module.exports = usuarioController;
