const ProdutoModel = require('../models/produtoModel');
const CategoriaModel = require('../models/categoriaModel');
const { salvarImagemProduto, removerImagemProduto } = require('../utils/productImage');

function validarProduto(dados, atual = {}) {
    const nome = dados.nome !== undefined ? dados.nome : atual.nome;
    if (typeof nome !== 'string' || !nome.trim()) {
        return { erro: 'Nome do produto é obrigatório.' };
    }

    const valores = { nome: nome.trim() };
    const camposNumericos = [
        ['preco_custo', 0],
        ['preco_venda', undefined],
        ['estoque_atual', 0],
        ['estoque_minimo', 0]
    ];

    for (const [campo, padrao] of camposNumericos) {
        const informado = dados[campo] !== undefined ? dados[campo] : atual[campo];
        const valor = informado === undefined ? padrao : informado;
        if (valor === undefined || valor === null || (typeof valor === 'string' && !valor.trim())) {
            return { erro: 'Preço de venda é obrigatório.' };
        }
        if (!['number', 'string'].includes(typeof valor)) {
            return { erro: `${campo} deve ser um valor numérico não negativo.` };
        }
        const numero = Number(valor);
        const escala = campo.startsWith('estoque_') ? 1000 : 100;
        const maximo = campo.startsWith('estoque_') ? 999999999.999 : 99999999.99;
        if (!Number.isFinite(numero) || numero < 0 || numero > maximo ||
            Math.abs(numero * escala - Math.round(numero * escala)) > 1e-7) {
            return { erro: `${campo} deve ser um valor numérico não negativo.` };
        }
        valores[campo] = numero;
    }

    const status = dados.status !== undefined ? dados.status : (atual.status || 'ATIVO');
    if (!['ATIVO', 'INATIVO'].includes(status)) {
        return { erro: 'Status do produto inválido.' };
    }
    valores.status = status;

    const categoria = dados.id_categoria !== undefined ? dados.id_categoria : atual.id_categoria;
    if (categoria !== undefined && categoria !== null && categoria !== '') {
        const idCategoria = Number(categoria);
        if (!Number.isInteger(idCategoria) || idCategoria <= 0) {
            return { erro: 'Categoria inválida.' };
        }
        valores.id_categoria = idCategoria;
    }
    if (dados.categoria_nome !== undefined && dados.categoria_nome !== null &&
        typeof dados.categoria_nome !== 'string') {
        return { erro: 'Nome da categoria inválido.' };
    }

    return { valores };
}

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
        let fotoSalva;
        try {
            let { codigo_barras, descricao, marca, unidade_medida, foto, id_categoria, categoria_nome } = req.body;

            const validacao = validarProduto(req.body);
            if (validacao.erro) {
                return res.status(400).json({ erro: validacao.erro });
            }

            // Se recebeu categoria_nome e não id_categoria, resolve a categoria
            if (!id_categoria && categoria_nome) {
                id_categoria = await CategoriaModel.obterOuCriar(categoria_nome);
            }

            if (foto !== undefined && foto !== null && foto !== '') {
                fotoSalva = await salvarImagemProduto(foto);
            }
            const novoProduto = await ProdutoModel.criar({
                codigo_barras,
                ...validacao.valores,
                descricao,
                marca,
                unidade_medida: unidade_medida || 'UN',
                foto: fotoSalva || null,
                id_categoria: id_categoria || validacao.valores.id_categoria || 1
            });

            res.status(201).json({
                mensagem: 'Produto cadastrado com sucesso!',
                produto: novoProduto
            });
        } catch (error) {
            if (fotoSalva) {
                await removerImagemProduto(fotoSalva).catch(erroLimpeza => {
                    console.error('Erro ao limpar arquivo de imagem após falha no cadastro:', erroLimpeza);
                });
            }
            console.error('Erro ao criar produto:', error);
            if (error.status) {
                return res.status(error.status).json({ erro: error.message });
            }
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ erro: 'Já existe um produto com este código de barras.' });
            }
            res.status(500).json({ erro: 'Erro ao cadastrar produto.' });
        }
    },

    async atualizar(req, res) {
        let fotoSalva;
        try {
            const { id } = req.params;
            let { codigo_barras, descricao, marca, unidade_medida, foto, id_categoria, categoria_nome } = req.body;

            const existente = await ProdutoModel.buscarPorId(id);
            if (!existente) {
                return res.status(404).json({ erro: 'Produto não encontrado.' });
            }

            const validacao = validarProduto(req.body, existente);
            if (validacao.erro) {
                return res.status(400).json({ erro: validacao.erro });
            }

            if (!id_categoria && categoria_nome) {
                id_categoria = await CategoriaModel.obterOuCriar(categoria_nome);
            }

            if (foto !== undefined && foto !== null && foto !== '') {
                fotoSalva = await salvarImagemProduto(foto);
            }
            const fotoAtualizada = foto === undefined ? existente.foto : (fotoSalva || null);
            const sucesso = await ProdutoModel.atualizar(id, {
                codigo_barras,
                ...validacao.valores,
                descricao,
                marca,
                unidade_medida: unidade_medida || existente.unidade_medida,
                foto: fotoAtualizada,
                id_categoria: id_categoria || validacao.valores.id_categoria || existente.id_categoria
            });

            if (sucesso) {
                if (foto !== undefined && existente.foto && existente.foto !== fotoAtualizada) {
                    await removerImagemProduto(existente.foto).catch(erroLimpeza => {
                        console.error('Erro ao remover a imagem substituída do produto:', erroLimpeza);
                    });
                }
                res.json({ mensagem: 'Produto atualizado com sucesso!' });
            } else {
                if (fotoSalva) await removerImagemProduto(fotoSalva);
                res.status(400).json({ erro: 'Não foi possível atualizar o produto.' });
            }
        } catch (error) {
            if (fotoSalva) {
                await removerImagemProduto(fotoSalva).catch(erroLimpeza => {
                    console.error('Erro ao limpar arquivo de imagem após falha na edição:', erroLimpeza);
                });
            }
            console.error('Erro ao atualizar produto:', error);
            if (error.status) {
                return res.status(error.status).json({ erro: error.message });
            }
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
