const db = require('../config/database');

const UsuarioModel = {
    async listarTodos(busca = '', tipo = '') {
        let sql = `
            SELECT 
                u.id_usuario, 
                u.nome, 
                u.cpf, 
                u.login, 
                u.email, 
                u.telefone, 
                u.status, 
                u.id_tipo_usuario, 
                u.data_cadastro, 
                t.nome AS tipo_nome
            FROM usuario u
            INNER JOIN tipo_usuario t ON u.id_tipo_usuario = t.id_tipo_usuario
            WHERE 1=1
        `;
        const params = [];

        if (busca && busca.trim()) {
            sql += ` AND (u.nome LIKE ? OR u.email LIKE ? OR u.login LIKE ? OR u.cpf LIKE ?)`;
            const termo = `%${busca.trim()}%`;
            params.push(termo, termo, termo, termo);
        }

        if (tipo && tipo.trim()) {
            sql += ` AND (t.nome = ? OR u.id_tipo_usuario = ?)`;
            params.push(tipo.trim(), tipo.trim());
        }

        sql += ` ORDER BY u.id_usuario DESC`;

        const [rows] = await db.query(sql, params);
        return rows;
    },

    async buscarPorId(id) {
        const sql = `
            SELECT 
                u.id_usuario, 
                u.nome, 
                u.cpf, 
                u.login, 
                u.email, 
                u.telefone, 
                u.status, 
                u.id_tipo_usuario, 
                u.data_cadastro, 
                t.nome AS tipo_nome
            FROM usuario u
            INNER JOIN tipo_usuario t ON u.id_tipo_usuario = t.id_tipo_usuario
            WHERE u.id_usuario = ?
        `;
        const [rows] = await db.query(sql, [id]);
        return rows[0] || null;
    },

    async buscarPorLoginOuEmail(identificador) {
        const sql = `
            SELECT 
                u.id_usuario, 
                u.nome, 
                u.cpf, 
                u.login, 
                u.email, 
                u.telefone, 
                u.senha, 
                u.status, 
                u.id_tipo_usuario, 
                t.nome AS tipo_nome
            FROM usuario u
            INNER JOIN tipo_usuario t ON u.id_tipo_usuario = t.id_tipo_usuario
            WHERE u.login = ? OR u.email = ?
            LIMIT 1
        `;
        const [rows] = await db.query(sql, [identificador, identificador]);
        return rows[0] || null;
    },

    async criar(dados) {
        const {
            nome,
            cpf = null,
            login,
            email = null,
            telefone = null,
            senha,
            status = 'ATIVO',
            id_tipo_usuario = 1
        } = dados;

        const sql = `
            INSERT INTO usuario (nome, cpf, login, email, telefone, senha, status, id_tipo_usuario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(sql, [
            nome,
            cpf,
            login,
            email,
            telefone,
            senha,
            status,
            id_tipo_usuario
        ]);

        return { id_usuario: result.insertId, ...dados };
    },

    async atualizar(id, dados) {
        const {
            nome,
            cpf = null,
            login,
            email = null,
            telefone = null,
            senha = null,
            status = 'ATIVO',
            id_tipo_usuario = 1
        } = dados;

        let sql = `
            UPDATE usuario 
            SET nome = ?, cpf = ?, login = ?, email = ?, telefone = ?, status = ?, id_tipo_usuario = ?
        `;
        const params = [nome, cpf, login, email, telefone, status, id_tipo_usuario];

        if (senha && senha.trim()) {
            sql += `, senha = ?`;
            params.push(senha);
        }

        sql += ` WHERE id_usuario = ?`;
        params.push(id);

        const [result] = await db.query(sql, params);
        return result.affectedRows > 0;
    },

    async deletar(id) {
        const sql = `DELETE FROM usuario WHERE id_usuario = ?`;
        const [result] = await db.query(sql, [id]);
        return result.affectedRows > 0;
    },

    async listarTipos() {
        const sql = `SELECT * FROM tipo_usuario ORDER BY id_tipo_usuario ASC`;
        const [rows] = await db.query(sql);
        return rows;
    }
};

module.exports = UsuarioModel;

