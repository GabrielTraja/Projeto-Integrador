const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

async function initDatabase() {
    let connection;
    try {
        // Conexão inicial sem banco selecionado para garantir criação do banco `pdv`
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || '',
            multipleStatements: true
        });

        const dbName = process.env.DB_NAME || 'pdv';

        await connection.query(`
            CREATE DATABASE IF NOT EXISTS \`${dbName}\`
            CHARACTER SET utf8mb4
            COLLATE utf8mb4_unicode_ci;
        `);

        await connection.changeUser({ database: dbName });

        // 1. Tabela tipo_usuario
        await connection.query(`
            CREATE TABLE IF NOT EXISTS tipo_usuario (
                id_tipo_usuario INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(50) NOT NULL UNIQUE,
                descricao VARCHAR(255)
            );
        `);

        // 2. Tabela usuario
        await connection.query(`
            CREATE TABLE IF NOT EXISTS usuario (
                id_usuario INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                cpf VARCHAR(14) NULL,
                login VARCHAR(50) NOT NULL UNIQUE,
                email VARCHAR(100) NULL,
                telefone VARCHAR(20) NULL,
                senha VARCHAR(255) NOT NULL,
                status ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
                id_tipo_usuario INT NOT NULL,
                data_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_usuario_tipo
                    FOREIGN KEY (id_tipo_usuario)
                    REFERENCES tipo_usuario(id_tipo_usuario)
            );
        `);

        // Garante que colunas adicionais existam se a tabela já tiver sido criada antes
        const [usrCols] = await connection.query(`DESCRIBE usuario`);
        const colNames = usrCols.map(c => c.Field);
        if (!colNames.includes('cpf')) {
            await connection.query(`ALTER TABLE usuario ADD COLUMN cpf VARCHAR(14) NULL AFTER nome`);
        }
        if (!colNames.includes('email')) {
            await connection.query(`ALTER TABLE usuario ADD COLUMN email VARCHAR(100) NULL AFTER login`);
        }
        if (!colNames.includes('telefone')) {
            await connection.query(`ALTER TABLE usuario ADD COLUMN telefone VARCHAR(20) NULL AFTER email`);
        }

        // 3. Tabela categoria
        await connection.query(`
            CREATE TABLE IF NOT EXISTS categoria (
                id_categoria INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL UNIQUE,
                descricao VARCHAR(255),
                status ENUM('ATIVA', 'INATIVA') NOT NULL DEFAULT 'ATIVA'
            );
        `);

        // 4. Tabela produto
        await connection.query(`
            CREATE TABLE IF NOT EXISTS produto (
                id_produto INT AUTO_INCREMENT PRIMARY KEY,
                codigo_barras VARCHAR(50) UNIQUE,
                nome VARCHAR(150) NOT NULL,
                descricao TEXT,
                marca VARCHAR(100),
                preco_custo DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                preco_venda DECIMAL(10,2) NOT NULL,
                estoque_atual DECIMAL(12,3) NOT NULL DEFAULT 0,
                estoque_minimo DECIMAL(12,3) NOT NULL DEFAULT 0,
                unidade_medida VARCHAR(10) NOT NULL DEFAULT 'UN',
                status ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
                foto VARCHAR(255) NULL,
                id_categoria INT NOT NULL,
                data_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_produto_categoria
                    FOREIGN KEY (id_categoria)
                    REFERENCES categoria(id_categoria)
            );
        `);

        const [prodCols] = await connection.query(`DESCRIBE produto`);
        const prodColNames = prodCols.map(c => c.Field);
        if (!prodColNames.includes('foto')) {
            await connection.query(`ALTER TABLE produto ADD COLUMN foto VARCHAR(255) NULL AFTER status`);
        }

        // 5. Seeds: Tipos de Usuários
        const tipos = [
            [1, 'Administrador', 'Acesso administrativo ao sistema'],
            [2, 'Gerente', 'Gerenciamento da operação e relatórios'],
            [3, 'Operador de Caixa', 'Registro de vendas e operação do caixa'],
            [4, 'Estoquista', 'Cadastro, entrada e ajuste de estoque']
        ];
        for (const [id, nome, desc] of tipos) {
            await connection.query(`
                INSERT INTO tipo_usuario (id_tipo_usuario, nome, descricao)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE nome = VALUES(nome), descricao = VALUES(descricao)
            `, [id, nome, desc]);
        }

        // 6. Seeds: Categorias Iniciais
        const categorias = [
            [1, 'Vestuário', 'Roupas e peças de vestuário'],
            [2, 'Calçados', 'Calçados e tênis'],
            [3, 'Acessórios', 'Bolsas, cintos e acessórios'],
            [4, 'Alimentos e Bebidas', 'Itens alimentícios e bebidas'],
            [5, 'Geral', 'Produtos e artigos em geral']
        ];
        for (const [id, nome, desc] of categorias) {
            await connection.query(`
                INSERT INTO categoria (id_categoria, nome, descricao)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE nome = VALUES(nome), descricao = VALUES(descricao)
            `, [id, nome, desc]);
        }

        // 7. Seed: Usuário Admin Inicial (caso não exista nenhum usuário)
        const [usuariosExistentes] = await connection.query(`SELECT COUNT(*) as total FROM usuario`);
        if (usuariosExistentes[0].total === 0) {
            await connection.query(`
                INSERT INTO usuario (nome, cpf, login, email, telefone, senha, status, id_tipo_usuario)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                'Administrador do Sistema',
                '000.000.000-00',
                'admin',
                'admin@pdv.com',
                '(11) 99999-9999',
                'admin123',
                'ATIVO',
                1
            ]);
            console.log('✔ Usuário admin inicial criado: login="admin", senha="admin123"');
        }

        // 8. Seed: Produtos Iniciais (caso não exista nenhum produto)
        const [produtosExistentes] = await connection.query(`SELECT COUNT(*) as total FROM produto`);
        if (produtosExistentes[0].total === 0) {
            await connection.query(`
                INSERT INTO produto (codigo_barras, nome, descricao, marca, preco_custo, preco_venda, estoque_atual, estoque_minimo, unidade_medida, status, id_categoria)
                VALUES 
                ('78910001', 'Camiseta Algodão Premium', 'Camiseta básica 100% algodão penteado', 'Marca Top', 25.00, 59.90, 45, 10, 'UN', 'ATIVO', 1),
                ('78910002', 'Tênis Esportivo Pro', 'Tênis esportivo para corrida e academia', 'SportFit', 80.00, 189.90, 2, 5, 'PAR', 'ATIVO', 2),
                ('78910003', 'Mochila Urbana Executiva', 'Mochila impermeável para notebook até 15.6"', 'UrbanBag', 45.00, 120.00, 18, 5, 'UN', 'ATIVO', 3),
                ('78910004', 'Boné Casual Aba Curva', 'Boné unissex com ajuste regulável', 'StyleWear', 15.00, 39.90, 30, 8, 'UN', 'ATIVO', 3)
            `);
            console.log('✔ Produtos iniciais cadastrados com sucesso!');
        }

        console.log('✔ Banco de dados e tabelas inicializados com sucesso.');
    } catch (error) {
        console.error('❌ Erro na inicialização do banco de dados:', error.message);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

if (require.main === module) {
    initDatabase().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = initDatabase;

