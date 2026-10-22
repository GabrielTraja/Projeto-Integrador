const CategoriaModel = require('../models/categoriaModel');

const categoriaController = {
    async listar(req, res) {
        try {
            const categorias = await CategoriaModel.listarTodas();
            res.json(categorias);
        } catch (error) {
            console.error('Erro ao listar categorias:', error);
            res.status(500).json({ erro: 'Erro ao listar categorias.' });
        }
    },

    async criar(req, res) {
        try {
            const { nome, descricao } = req.body;
            if (!nome || !nome.trim()) {
                return res.status(400).json({ erro: 'Nome da categoria é obrigatório.' });
            }
            const existente = await CategoriaModel.buscarPorNome(nome);
            if (existente) {
                return res.status(409).json({ erro: 'Categoria já cadastrada.' });
            }
            const categoria = await CategoriaModel.criar(nome, descricao);
            res.status(201).json(categoria);
        } catch (error) {
            console.error('Erro ao criar categoria:', error);
            res.status(500).json({ erro: 'Erro ao criar categoria.' });
        }
    }
};

module.exports = categoriaController;

