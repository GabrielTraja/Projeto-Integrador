const ProdutoModel = require('../models/produtoModel');
const CategoriaModel = require('../models/categoriaModel');

const produtoController = {
    async listar(req, res) {
        try {
            const { busca, categoria } = req.query;
            const produtos = await ProdutoModel.listarTodos(busca, categoria);
            res.json(produtos);
        } catch (error) {
            console.error('Erro ao listar produtos:', error);
            res.status(500).json({ erro: 'Erro interno ao listar produtos.' });
        }
    },

    async buscarPorId(req, res) {
        try {
            const { id } = req.params;
            const produto = await ProdutoModel.buscarPorId(id);
            if (!produto) {
                return res.status(404).json({ erro: 'Produto não encontrado.' });
            }
            res.json(produto);
        } catch (error) {
            console.error('Erro ao buscar produto:', error);
            res.status(500).json({ erro: 'Erro ao buscar produto.' });
        }
    },

    async criar(req, res) {
        try {
            let {
                codigo_barras,
                nome,
                descricao,
                marca,
                preco_custo,
                preco_venda,
                estoque_atual,
                estoque_minimo,
                unidade_medida,
                status,
                foto,
                id_categoria,
                categoria_nome
            } = req.body;

            if (!nome || preco_venda === undefined || preco_venda === null) {
                return res.status(400).json({ erro: 'Nome do produto e preço de venda são obrigatórios.' });
            }

            // Se recebeu categoria_nome e não id_categoria, resolve a categoria
            if (!id_categoria && categoria_nome) {
                id_categoria = await CategoriaModel.obterOuCriar(categoria_nome);
            }

            const novoProduto = await ProdutoModel.criar({
                codigo_barras,
                nome,
                descricao,
                marca,
                preco_custo: preco_custo || 0,
                preco_venda,
                estoque_atual: estoque_atual || 0,
                estoque_minimo: estoque_minimo || 0,
                unidade_medida: unidade_medida || 'UN',
                status: status || 'ATIVO',
                foto,
                id_categoria: id_categoria || 1
            });

            res.status(201).json({
                mensagem: 'Produto cadastrado com sucesso!',
                produto: novoProduto
            });
        } catch (error) {
            console.error('Erro ao criar produto:', error);
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ erro: 'Já existe um produto com este código de barras.' });
            }
            res.status(500).json({ erro: 'Erro ao cadastrar produto.' });
        }
    },

    async atualizar(req, res) {
        try {
            const { id } = req.params;
            let {
                codigo_barras,
                nome,
                descricao,
                marca,
                preco_custo,
                preco_venda,
                estoque_atual,
                estoque_minimo,
                unidade_medida,
                status,
                foto,
                id_categoria,
                categoria_nome
            } = req.body;

            if (!nome || preco_venda === undefined || preco_venda === null) {
                return res.status(400).json({ erro: 'Nome do produto e preço de venda são obrigatórios.' });
            }

            const existente = await ProdutoModel.buscarPorId(id);
            if (!existente) {
                return res.status(404).json({ erro: 'Produto não encontrado.' });
            }

            if (!id_categoria && categoria_nome) {
                id_categoria = await CategoriaModel.obterOuCriar(categoria_nome);
            }

            const sucesso = await ProdutoModel.atualizar(id, {
                codigo_barras,
                nome,
                descricao,
                marca,
                preco_custo: preco_custo !== undefined ? preco_custo : existente.preco_custo,
                preco_venda: preco_venda !== undefined ? preco_venda : existente.preco_venda,
                estoque_atual: estoque_atual !== undefined ? estoque_atual : existente.estoque_atual,
                estoque_minimo: estoque_minimo !== undefined ? estoque_minimo : existente.estoque_minimo,
                unidade_medida: unidade_medida || existente.unidade_medida,
                status: status || existente.status,
                foto: foto !== undefined ? foto : existente.foto,
                id_categoria: id_categoria || existente.id_categoria
            });

            if (sucesso) {
                res.json({ mensagem: 'Produto atualizado com sucesso!' });
            } else {
                res.status(400).json({ erro: 'Não foi possível atualizar o produto.' });
            }
        } catch (error) {
            console.error('Erro ao atualizar produto:', error);
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ erro: 'Já existe um produto com este código de barras.' });
            }
            res.status(500).json({ erro: 'Erro ao atualizar produto.' });
        }
    },

    async deletar(req, res) {
        try {
            const { id } = req.params;
            const sucesso = await ProdutoModel.deletar(id);
            if (!sucesso) {
                return res.status(404).json({ erro: 'Produto não encontrado ou já deletado.' });
            }
            res.json({ mensagem: 'Produto deletado com sucesso!' });
        } catch (error) {
            console.error('Erro ao deletar produto:', error);
            if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                return res.status(400).json({
                    erro: 'Não é possível excluir este produto pois ele possui histórico de vendas ou movimentação de estoque. Altere seu status para INATIVO.'
                });
            }
            res.status(500).json({ erro: 'Erro ao deletar produto.' });
        }
    }
};

module.exports = produtoController;

