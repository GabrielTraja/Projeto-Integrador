const db = require('../config/database');

const ProdutoModel = {
    async listarTodos(busca = '', id_categoria = '') {
        let sql = `
            SELECT 
                p.id_produto,
                p.codigo_barras,
                p.nome,
                p.descricao,
                p.marca,
                p.preco_custo,
                p.preco_venda,
                p.estoque_atual,
                p.estoque_minimo,
                p.unidade_medida,
                p.status,
                p.foto,
                p.id_categoria,
                p.data_cadastro,
                c.nome AS categoria_nome
            FROM produto p
            LEFT JOIN categoria c ON p.id_categoria = c.id_categoria
            WHERE 1=1
        `;
        const params = [];

        if (busca && busca.trim()) {
            sql += ` AND (p.nome LIKE ? OR p.codigo_barras LIKE ? OR p.marca LIKE ?)`;
            const termo = `%${busca.trim()}%`;
            params.push(termo, termo, termo);
        }

        if (id_categoria && id_categoria.trim() !== '') {
            sql += ` AND (p.id_categoria = ? OR c.nome = ?)`;
            params.push(id_categoria.trim(), id_categoria.trim());
        }

        sql += ` ORDER BY p.id_produto DESC`;

        const [rows] = await db.query(sql, params);
        return rows;
    },

    async buscarPorId(id) {
        const sql = `
            SELECT 
                p.id_produto,
                p.codigo_barras,
                p.nome,
                p.descricao,
                p.marca,
                p.preco_custo,
                p.preco_venda,
                p.estoque_atual,
                p.estoque_minimo,
                p.unidade_medida,
                p.status,
                p.foto,
                p.id_categoria,
                p.data_cadastro,
                c.nome AS categoria_nome
            FROM produto p
            LEFT JOIN categoria c ON p.id_categoria = c.id_categoria
            WHERE p.id_produto = ?
        `;
        const [rows] = await db.query(sql, [id]);
        return rows[0] || null;
    },

    async criar(dados) {
        const {
            codigo_barras = null,
            nome,
            descricao = null,
            marca = null,
            preco_custo = 0.00,
            preco_venda,
            estoque_atual = 0,
            estoque_minimo = 0,
            unidade_medida = 'UN',
            status = 'ATIVO',
            foto = null,
            id_categoria = 1
        } = dados;

        const sql = `
            INSERT INTO produto 
            (codigo_barras, nome, descricao, marca, preco_custo, preco_venda, estoque_atual, estoque_minimo, unidade_medida, status, foto, id_categoria)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(sql, [
            codigo_barras || null,
            nome,
            descricao,
            marca,
            parseFloat(preco_custo) || 0,
            parseFloat(preco_venda),
            parseFloat(estoque_atual) || 0,
            parseFloat(estoque_minimo) || 0,
            (unidade_medida || 'UN').toUpperCase(),
            status || 'ATIVO',
            foto || null,
            parseInt(id_categoria, 10) || 1
        ]);

        return { id_produto: result.insertId, ...dados };
    },

    async atualizar(id, dados) {
        const {
            codigo_barras = null,
            nome,
            descricao = null,
            marca = null,
            preco_custo = 0.00,
            preco_venda,
            estoque_atual = 0,
            estoque_minimo = 0,
            unidade_medida = 'UN',
            status = 'ATIVO',
            foto = null,
            id_categoria = 1
        } = dados;

        const sql = `
            UPDATE produto 
            SET codigo_barras = ?,
                nome = ?,
                descricao = ?,
                marca = ?,
                preco_custo = ?,
                preco_venda = ?,
                estoque_atual = ?,
                estoque_minimo = ?,
                unidade_medida = ?,
                status = ?,
                foto = ?,
                id_categoria = ?
            WHERE id_produto = ?
        `;
        const [result] = await db.query(sql, [
            codigo_barras || null,
            nome,
            descricao,
            marca,
            parseFloat(preco_custo) || 0,
            parseFloat(preco_venda),
            parseFloat(estoque_atual) || 0,
            parseFloat(estoque_minimo) || 0,
            (unidade_medida || 'UN').toUpperCase(),
            status || 'ATIVO',
            foto || null,
            parseInt(id_categoria, 10) || 1,
            id
        ]);

        return result.affectedRows > 0;
    },

    async deletar(id) {
        const sql = `DELETE FROM produto WHERE id_produto = ?`;
        const [result] = await db.query(sql, [id]);
        return result.affectedRows > 0;
    }
};

module.exports = ProdutoModel;

