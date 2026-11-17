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
                p.perecivel,
                DATE_FORMAT(p.data_validade, '%Y-%m-%d') AS data_validade,
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
                p.perecivel,
                DATE_FORMAT(p.data_validade, '%Y-%m-%d') AS data_validade,
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
            perecivel = false,
            data_validade = null,
            id_categoria = 1
        } = dados;

        const sql = `
            INSERT INTO produto 
            (codigo_barras, nome, descricao, marca, preco_custo, preco_venda, estoque_atual, estoque_minimo, unidade_medida, status, foto, perecivel, data_validade, id_categoria)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            perecivel ? 1 : 0,
            perecivel ? (data_validade || null) : null,
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
            perecivel = false,
            data_validade = null,
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
                perecivel = ?,
                data_validade = ?,
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
            perecivel ? 1 : 0,
            perecivel ? (data_validade || null) : null,
            parseInt(id_categoria, 10) || 1,
            id
        ]);

        return result.affectedRows > 0;
    },

    // Produtos perecíveis ativos, com estoque, vencidos ou que vencem nos próximos `dias` dias
    async listarProximosVencimento(dias = 3) {
        const sql = `
            SELECT
                p.id_produto,
                p.nome,
                p.codigo_barras,
                p.estoque_atual,
                p.unidade_medida,
                DATE_FORMAT(p.data_validade, '%Y-%m-%d') AS data_validade,
                DATEDIFF(p.data_validade, CURDATE()) AS dias_restantes
            FROM produto p
            WHERE p.perecivel = 1
              AND p.status = 'ATIVO'
              AND p.data_validade IS NOT NULL
              AND p.estoque_atual > 0
              AND p.data_validade <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
            ORDER BY p.data_validade ASC, p.nome ASC
        `;
        const [rows] = await db.query(sql, [dias]);
        return rows;
    },

    async deletar(id) {
        const sql = `DELETE FROM produto WHERE id_produto = ?`;
        const [result] = await db.query(sql, [id]);
        return result.affectedRows > 0;
    }
};

module.exports = ProdutoModel;

