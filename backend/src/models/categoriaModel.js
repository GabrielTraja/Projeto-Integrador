const db = require('../config/database');

const CategoriaModel = {
    async listarTodas() {
        const sql = `SELECT * FROM categoria WHERE status = 'ATIVA' ORDER BY nome ASC`;
        const [rows] = await db.query(sql);
        return rows;
    },

    async buscarPorId(id) {
        const sql = `SELECT * FROM categoria WHERE id_categoria = ?`;
        const [rows] = await db.query(sql, [id]);
        return rows[0] || null;
    },

    async buscarPorNome(nome) {
        const sql = `SELECT * FROM categoria WHERE LOWER(nome) = LOWER(?) LIMIT 1`;
        const [rows] = await db.query(sql, [nome.trim()]);
        return rows[0] || null;
    },

    async criar(nome, descricao = '') {
        const sql = `INSERT INTO categoria (nome, descricao) VALUES (?, ?)`;
        const [result] = await db.query(sql, [nome.trim(), descricao]);
        return { id_categoria: result.insertId, nome: nome.trim(), descricao };
    },

    async obterOuCriar(nome) {
        if (!nome || !nome.trim()) return 1; // Padrão
        const existente = await this.buscarPorNome(nome);
        if (existente) return existente.id_categoria;
        const nova = await this.criar(nome);
        return nova.id_categoria;
    }
};

module.exports = CategoriaModel;

