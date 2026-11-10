const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');
const { hashPassword } = require('../utils/password');

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
                UNIQUE KEY uq_usuario_email (email),
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
        await connection.query(`UPDATE usuario SET email = NULL WHERE email IS NOT NULL AND TRIM(email) = ''`);
        const [emailsDuplicados] = await connection.query(`
            SELECT email, COUNT(*) AS total
            FROM usuario
            WHERE email IS NOT NULL
            GROUP BY email
            HAVING COUNT(*) > 1
            LIMIT 1
        `);
        if (emailsDuplicados.length > 0) {
            throw new Error('Há e-mails associados a mais de um usuário. Corrija as duplicidades antes de iniciar.');
        }
        const [emailIndex] = await connection.query(`
            SELECT COUNT(*) AS total
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'usuario'
              AND column_name = 'email'
              AND non_unique = 0
        `);
        if (emailIndex[0].total === 0) {
            await connection.query(`ALTER TABLE usuario ADD UNIQUE INDEX uq_usuario_email (email)`);
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
                    REFERENCES categoria(id_categoria),
                CONSTRAINT chk_produto_preco_custo CHECK (preco_custo >= 0),
                CONSTRAINT chk_produto_preco_venda CHECK (preco_venda >= 0),
                CONSTRAINT chk_produto_estoque CHECK (estoque_atual >= 0 AND estoque_minimo >= 0)
            );
        `);

        const [prodCols] = await connection.query(`DESCRIBE produto`);
        const prodColNames = prodCols.map(c => c.Field);
        if (!prodColNames.includes('foto')) {
            await connection.query(`ALTER TABLE produto ADD COLUMN foto VARCHAR(255) NULL AFTER status`);
        }
        const constraintsProduto = [
            ['chk_produto_preco_custo', 'CHECK (preco_custo >= 0)'],
            ['chk_produto_preco_venda', 'CHECK (preco_venda >= 0)'],
            ['chk_produto_estoque', 'CHECK (estoque_atual >= 0 AND estoque_minimo >= 0)']
        ];
        for (const [nome, expressao] of constraintsProduto) {
            const [constraint] = await connection.query(`
                SELECT COUNT(*) AS total
                FROM information_schema.table_constraints
                WHERE constraint_schema = DATABASE()
                  AND table_name = 'produto'
                  AND constraint_name = ?
                  AND constraint_type = 'CHECK'
            `, [nome]);
            if (constraint[0].total === 0) {
                await connection.query(`ALTER TABLE produto ADD CONSTRAINT \`${nome}\` ${expressao}`);
            }
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
        const senhaAdminLegada = 'admin123';
        const hashAdminLegado = 'scrypt$a23f4c2b9ec4dca3f8697d43dd0cbf4a$c7008aee41bb96224bc9064bbdd76f04d6774f65759b485067fde94ea3bb54c2264fbb68a42d89d1000139179dbe656ea745179a140c73cc177f3ef04ac667f9';
        const [adminLegado] = await connection.query(`
            SELECT id_usuario, senha FROM usuario WHERE login = 'admin' LIMIT 1
        `);
        if (adminLegado.length > 0 &&
            [senhaAdminLegada, hashAdminLegado].includes(adminLegado[0].senha)) {
            const senhaConfigurada = process.env.ADMIN_INITIAL_PASSWORD;
            if (typeof senhaConfigurada !== 'string' || senhaConfigurada.length < 12) {
                throw new Error('A conta admin ainda usa a credencial inicial conhecida. Configure ADMIN_INITIAL_PASSWORD com pelo menos 12 caracteres para substituí-la.');
            }
            await connection.query(
                `UPDATE usuario SET senha = ? WHERE id_usuario = ?`,
                [await hashPassword(senhaConfigurada), adminLegado[0].id_usuario]
            );
            console.log('✔ Credencial inicial da conta admin substituída pela senha configurada.');
        }
        if (usuariosExistentes[0].total === 0) {
            const senhaConfigurada = process.env.ADMIN_INITIAL_PASSWORD;
            if (typeof senhaConfigurada !== 'string' || senhaConfigurada.length < 12) {
                throw new Error('Configure ADMIN_INITIAL_PASSWORD com pelo menos 12 caracteres para criar o administrador inicial.');
            }
            const senhaInicial = await hashPassword(senhaConfigurada);
            await connection.query(`
                INSERT INTO usuario (nome, cpf, login, email, telefone, senha, status, id_tipo_usuario)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                'Administrador do Sistema',
                '000.000.000-00',
                'admin',
                'admin@pdv.com',
                '(11) 99999-9999',
                senhaInicial,
                'ATIVO',
                1
            ]);
            console.log('✔ Usuário administrador inicial criado.');
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

        // 9. Tabelas de Vendas e Caixa
        await connection.query(`
            CREATE TABLE IF NOT EXISTS caixa (
                id_caixa INT AUTO_INCREMENT PRIMARY KEY,
                data_abertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                data_fechamento DATETIME,
                valor_inicial DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                valor_final DECIMAL(12,2),
                status ENUM('ABERTO', 'FECHADO') NOT NULL DEFAULT 'ABERTO',
                observacao VARCHAR(255),
                id_usuario_abertura INT NOT NULL,
                id_usuario_fechamento INT,
                CONSTRAINT fk_caixa_usuario_abertura FOREIGN KEY (id_usuario_abertura) REFERENCES usuario(id_usuario)
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS forma_pagamento (
                id_forma_pagamento INT AUTO_INCREMENT PRIMARY KEY,
                descricao VARCHAR(50) NOT NULL UNIQUE,
                status ENUM('ATIVA', 'INATIVA') NOT NULL DEFAULT 'ATIVA'
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS configuracao_estabelecimento (
                id_configuracao TINYINT PRIMARY KEY,
                nome_fantasia VARCHAR(120) NOT NULL DEFAULT '',
                razao_social VARCHAR(160) NOT NULL DEFAULT '',
                cnpj VARCHAR(18) NOT NULL DEFAULT '',
                inscricao_estadual VARCHAR(30) NOT NULL DEFAULT '',
                telefone VARCHAR(30) NOT NULL DEFAULT '',
                email VARCHAR(120) NOT NULL DEFAULT '',
                cep VARCHAR(9) NOT NULL DEFAULT '',
                endereco VARCHAR(160) NOT NULL DEFAULT '',
                numero VARCHAR(20) NOT NULL DEFAULT '',
                complemento VARCHAR(100) NOT NULL DEFAULT '',
                bairro VARCHAR(100) NOT NULL DEFAULT '',
                cidade VARCHAR(100) NOT NULL DEFAULT '',
                estado CHAR(2) NOT NULL DEFAULT '',
                logotipo VARCHAR(255) NULL,
                rede_social VARCHAR(120) NOT NULL DEFAULT '',
                mensagem_agradecimento VARCHAR(255) NOT NULL DEFAULT '',
                largura_papel TINYINT NOT NULL DEFAULT 80,
                exibir_logotipo TINYINT(1) NOT NULL DEFAULT 1,
                exibir_cnpj TINYINT(1) NOT NULL DEFAULT 1,
                exibir_endereco TINYINT(1) NOT NULL DEFAULT 1,
                exibir_telefone TINYINT(1) NOT NULL DEFAULT 1,
                exibir_operador TINYINT(1) NOT NULL DEFAULT 1,
                exibir_numero_venda TINYINT(1) NOT NULL DEFAULT 1,
                exibir_data_horario TINYINT(1) NOT NULL DEFAULT 1,
                exibir_forma_pagamento TINYINT(1) NOT NULL DEFAULT 1,
                exibir_valor_recebido TINYINT(1) NOT NULL DEFAULT 1,
                exibir_troco TINYINT(1) NOT NULL DEFAULT 1,
                mensagem_rodape VARCHAR(255) NOT NULL DEFAULT '',
                quantidade_vias TINYINT UNSIGNED NOT NULL DEFAULT 1,
                CONSTRAINT chk_configuracao_estabelecimento_id CHECK (id_configuracao = 1),
                CONSTRAINT chk_configuracao_largura CHECK (largura_papel IN (58, 80)),
                CONSTRAINT chk_configuracao_vias CHECK (quantidade_vias BETWEEN 1 AND 5)
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS venda (
                id_venda INT AUTO_INCREMENT PRIMARY KEY,
                data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                valor_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                desconto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                valor_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                status ENUM('ABERTA', 'FINALIZADA', 'CANCELADA') NOT NULL DEFAULT 'ABERTA',
                observacao VARCHAR(255),
                id_usuario INT NOT NULL,
                id_caixa INT NOT NULL,
                CONSTRAINT fk_venda_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
                CONSTRAINT fk_venda_caixa FOREIGN KEY (id_caixa) REFERENCES caixa(id_caixa)
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS item_venda (
                id_item_venda INT AUTO_INCREMENT PRIMARY KEY,
                id_venda INT NOT NULL,
                id_produto INT NOT NULL,
                quantidade DECIMAL(12,3) NOT NULL,
                preco_unitario DECIMAL(10,2) NOT NULL,
                desconto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                subtotal DECIMAL(12,2) NOT NULL,
                CONSTRAINT fk_item_venda_venda FOREIGN KEY (id_venda) REFERENCES venda(id_venda),
                CONSTRAINT fk_item_venda_produto FOREIGN KEY (id_produto) REFERENCES produto(id_produto)
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS pagamento (
                id_pagamento INT AUTO_INCREMENT PRIMARY KEY,
                id_venda INT NOT NULL,
                id_forma_pagamento INT NOT NULL,
                valor DECIMAL(12,2) NOT NULL,
                data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                status ENUM('APROVADO', 'PENDENTE', 'ESTORNADO') NOT NULL DEFAULT 'APROVADO',
                observacao VARCHAR(255),
                CONSTRAINT fk_pagamento_venda FOREIGN KEY (id_venda) REFERENCES venda(id_venda),
                CONSTRAINT fk_pagamento_forma FOREIGN KEY (id_forma_pagamento) REFERENCES forma_pagamento(id_forma_pagamento)
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS movimentacao_caixa (
                id_movimentacao_caixa INT AUTO_INCREMENT PRIMARY KEY,
                id_caixa INT NOT NULL,
                id_venda INT NOT NULL,
                id_usuario INT NOT NULL,
                id_forma_pagamento INT NOT NULL,
                tipo ENUM('ENTRADA', 'SAIDA') NOT NULL,
                valor DECIMAL(12,2) NOT NULL,
                data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                descricao VARCHAR(255),
                CONSTRAINT fk_movimentacao_caixa_caixa FOREIGN KEY (id_caixa) REFERENCES caixa(id_caixa),
                CONSTRAINT fk_movimentacao_caixa_venda FOREIGN KEY (id_venda) REFERENCES venda(id_venda),
                CONSTRAINT fk_movimentacao_caixa_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
                CONSTRAINT fk_movimentacao_caixa_forma FOREIGN KEY (id_forma_pagamento) REFERENCES forma_pagamento(id_forma_pagamento),
                CONSTRAINT chk_movimentacao_caixa_valor CHECK (valor > 0),
                CONSTRAINT uq_movimentacao_caixa_venda_forma UNIQUE (id_venda, id_forma_pagamento)
            );
        `);

        const [movimentacaoCaixaIndices] = await connection.query(`
            SELECT index_name AS ix_name, COUNT(*) AS colunas, MAX(column_name) AS coluna
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'movimentacao_caixa'
              AND non_unique = 0
              AND index_name <> 'PRIMARY'
            GROUP BY index_name
        `);
        const indicesVendaUnicos = movimentacaoCaixaIndices.filter(
            indice => Number(indice.colunas) === 1 && indice.coluna === 'id_venda'
        );
        if (indicesVendaUnicos.length > 0) {
            const [foreignKeysVenda] = await connection.query(`
                SELECT DISTINCT constraint_name AS fk_name
                FROM information_schema.key_column_usage
                WHERE table_schema = DATABASE()
                  AND table_name = 'movimentacao_caixa'
                  AND column_name = 'id_venda'
                  AND referenced_table_name = 'venda'
                  AND referenced_column_name = 'id_venda'
            `);
            for (const foreignKey of foreignKeysVenda) {
                await connection.query(
                    `ALTER TABLE movimentacao_caixa DROP FOREIGN KEY \`${foreignKey.fk_name}\``
                );
            }
            for (const indice of indicesVendaUnicos) {
                await connection.query(`ALTER TABLE movimentacao_caixa DROP INDEX \`${indice.ix_name}\``);
            }
        }
        const [movimentacaoCaixaUnique] = await connection.query(`
            SELECT index_name
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'movimentacao_caixa'
              AND non_unique = 0
            GROUP BY index_name
            HAVING GROUP_CONCAT(column_name ORDER BY seq_in_index) = 'id_venda,id_forma_pagamento'
        `);
        if (movimentacaoCaixaUnique.length === 0) {
            await connection.query(`
                ALTER TABLE movimentacao_caixa
                ADD CONSTRAINT uq_movimentacao_caixa_venda_forma UNIQUE (id_venda, id_forma_pagamento)
            `);
        }
        const [foreignKeyVendaAtual] = await connection.query(`
            SELECT COUNT(*) AS total
            FROM information_schema.key_column_usage
            WHERE table_schema = DATABASE()
              AND table_name = 'movimentacao_caixa'
              AND column_name = 'id_venda'
              AND referenced_table_name = 'venda'
              AND referenced_column_name = 'id_venda'
        `);
        if (foreignKeyVendaAtual[0].total === 0) {
            await connection.query(`
                ALTER TABLE movimentacao_caixa
                ADD CONSTRAINT fk_movimentacao_caixa_venda
                FOREIGN KEY (id_venda) REFERENCES venda(id_venda)
            `);
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS movimentacao_estoque (
                id_movimentacao INT AUTO_INCREMENT PRIMARY KEY,
                id_produto INT NOT NULL,
                id_usuario INT NOT NULL,
                id_venda INT,
                tipo ENUM('ENTRADA', 'SAIDA', 'AJUSTE') NOT NULL,
                quantidade DECIMAL(12,3) NOT NULL,
                data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                motivo VARCHAR(255),
                observacao VARCHAR(255),
                CONSTRAINT fk_movimentacao_produto FOREIGN KEY (id_produto) REFERENCES produto(id_produto),
                CONSTRAINT fk_movimentacao_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
                CONSTRAINT fk_movimentacao_venda FOREIGN KEY (id_venda) REFERENCES venda(id_venda)
            );
        `);

        const [movementSaleForeignKey] = await connection.query(`
            SELECT COUNT(*) AS total
            FROM information_schema.table_constraints
            WHERE constraint_schema = DATABASE()
              AND table_name = 'movimentacao_estoque'
              AND constraint_name = 'fk_movimentacao_venda'
              AND constraint_type = 'FOREIGN KEY'
        `);
        if (movementSaleForeignKey[0].total === 0) {
            await connection.query(`
                ALTER TABLE movimentacao_estoque
                ADD CONSTRAINT fk_movimentacao_venda
                FOREIGN KEY (id_venda) REFERENCES venda(id_venda)
            `);
        }

        const indices = [
            ['venda', 'idx_venda_data', 'data_hora'],
            ['venda', 'idx_venda_status', 'status'],
            ['item_venda', 'idx_item_venda_venda', 'id_venda'],
            ['item_venda', 'idx_item_venda_produto', 'id_produto'],
            ['movimentacao_estoque', 'idx_movimentacao_data', 'data_hora'],
            ['movimentacao_estoque', 'idx_movimentacao_produto', 'id_produto'],
            ['movimentacao_caixa', 'idx_movimentacao_caixa_data', 'data_hora'],
            ['movimentacao_caixa', 'idx_movimentacao_caixa_id_caixa', 'id_caixa'],
            ['produto', 'idx_produto_nome', 'nome']
        ];
        for (const [table, index, column] of indices) {
            const [existing] = await connection.query(`
                SELECT COUNT(*) AS total
                FROM information_schema.statistics
                WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
            `, [table, index]);
            if (existing[0].total === 0) {
                await connection.query(`CREATE INDEX \`${index}\` ON \`${table}\` (\`${column}\`)`);
            }
        }

        // Seeds: Formas de Pagamento
        const formasPagamento = ['Dinheiro', 'Pix', 'Cartão de Débito', 'Cartão de Crédito'];
        for (const forma of formasPagamento) {
            await connection.query(`INSERT IGNORE INTO forma_pagamento (descricao) VALUES (?)`, [forma]);
        }

        // Seed: Caixa Aberto Padrão
        const [caixas] = await connection.query(`SELECT COUNT(*) as total FROM caixa`);
        if (caixas[0].total === 0) {
            await connection.query(`
                INSERT INTO caixa (valor_inicial, status, observacao, id_usuario_abertura)
                VALUES (150.00, 'ABERTO', 'Caixa Inicial PDV', 1)
            `);
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
