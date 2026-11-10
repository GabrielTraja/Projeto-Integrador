-- =====================================================
-- BANCO DE DADOS: PDV - PONTO DE VENDA
-- =====================================================

CREATE DATABASE IF NOT EXISTS pdv
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE pdv;

-- =====================================================
-- 1. TIPOS DE USUARIOS / PERFIS DE ACESSO
-- =====================================================

CREATE TABLE IF NOT EXISTS tipo_usuario (
    id_tipo_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL UNIQUE,
    descricao VARCHAR(255)
);

-- =====================================================
-- 2. USUARIOS
-- =====================================================

CREATE TABLE IF NOT EXISTS usuario (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cpf VARCHAR(14),
    login VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100),
    telefone VARCHAR(20),
    senha VARCHAR(255) NOT NULL,
    status ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    id_tipo_usuario INT NOT NULL,
    data_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_usuario_email (email),

    CONSTRAINT fk_usuario_tipo
        FOREIGN KEY (id_tipo_usuario)
        REFERENCES tipo_usuario(id_tipo_usuario)
);

-- =====================================================
-- 3. CATEGORIAS DE PRODUTOS
-- =====================================================

CREATE TABLE IF NOT EXISTS categoria (
    id_categoria INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    descricao VARCHAR(255),
    status ENUM('ATIVA', 'INATIVA') NOT NULL DEFAULT 'ATIVA'
);

-- =====================================================
-- 4. PRODUTOS
-- =====================================================

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
    foto VARCHAR(255),
    id_categoria INT NOT NULL,
    data_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_produto_categoria
        FOREIGN KEY (id_categoria)
        REFERENCES categoria(id_categoria),

    CONSTRAINT chk_produto_preco_custo
        CHECK (preco_custo >= 0),

    CONSTRAINT chk_produto_preco_venda
        CHECK (preco_venda >= 0),

    CONSTRAINT chk_produto_estoque
        CHECK (estoque_atual >= 0 AND estoque_minimo >= 0)
);

-- =====================================================
-- 5. CAIXAS
-- =====================================================

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

    CONSTRAINT fk_caixa_usuario_abertura
        FOREIGN KEY (id_usuario_abertura)
        REFERENCES usuario(id_usuario),

    CONSTRAINT fk_caixa_usuario_fechamento
        FOREIGN KEY (id_usuario_fechamento)
        REFERENCES usuario(id_usuario),

    CONSTRAINT chk_caixa_valor_inicial
        CHECK (valor_inicial >= 0),

    CONSTRAINT chk_caixa_valor_final
        CHECK (valor_final IS NULL OR valor_final >= 0)
);

-- =====================================================
-- 6. VENDAS
-- =====================================================

CREATE TABLE IF NOT EXISTS venda (
    id_venda INT AUTO_INCREMENT PRIMARY KEY,
    data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valor_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    desconto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    valor_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status ENUM(
        'ABERTA',
        'FINALIZADA',
        'CANCELADA'
    ) NOT NULL DEFAULT 'ABERTA',
    observacao VARCHAR(255),
    id_usuario INT NOT NULL,
    id_caixa INT NOT NULL,

    CONSTRAINT fk_venda_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario),

    CONSTRAINT fk_venda_caixa
        FOREIGN KEY (id_caixa)
        REFERENCES caixa(id_caixa),

    CONSTRAINT chk_venda_valores
        CHECK (
            valor_subtotal >= 0
            AND desconto >= 0
            AND valor_total >= 0
        )
);

-- =====================================================
-- 7. ITENS DA VENDA
-- =====================================================

CREATE TABLE IF NOT EXISTS item_venda (
    id_item_venda INT AUTO_INCREMENT PRIMARY KEY,
    id_venda INT NOT NULL,
    id_produto INT NOT NULL,
    quantidade DECIMAL(12,3) NOT NULL,
    preco_unitario DECIMAL(10,2) NOT NULL,
    desconto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(12,2) NOT NULL,

    CONSTRAINT fk_item_venda_venda
        FOREIGN KEY (id_venda)
        REFERENCES venda(id_venda),

    CONSTRAINT fk_item_venda_produto
        FOREIGN KEY (id_produto)
        REFERENCES produto(id_produto),

    CONSTRAINT chk_item_quantidade
        CHECK (quantidade > 0),

    CONSTRAINT chk_item_precos
        CHECK (
            preco_unitario >= 0
            AND desconto >= 0
            AND subtotal >= 0
        )
);

-- =====================================================
-- 8. FORMAS DE PAGAMENTO
-- =====================================================

CREATE TABLE IF NOT EXISTS forma_pagamento (
    id_forma_pagamento INT AUTO_INCREMENT PRIMARY KEY,
    descricao VARCHAR(50) NOT NULL UNIQUE,
    status ENUM('ATIVA', 'INATIVA') NOT NULL DEFAULT 'ATIVA'
);

-- =====================================================
-- 9. PAGAMENTOS
-- =====================================================

CREATE TABLE IF NOT EXISTS pagamento (
    id_pagamento INT AUTO_INCREMENT PRIMARY KEY,
    id_venda INT NOT NULL,
    id_forma_pagamento INT NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('APROVADO', 'PENDENTE', 'ESTORNADO')
        NOT NULL DEFAULT 'APROVADO',
    observacao VARCHAR(255),

    CONSTRAINT fk_pagamento_venda
        FOREIGN KEY (id_venda)
        REFERENCES venda(id_venda),

    CONSTRAINT fk_pagamento_forma
        FOREIGN KEY (id_forma_pagamento)
        REFERENCES forma_pagamento(id_forma_pagamento),

    CONSTRAINT chk_pagamento_valor
        CHECK (valor > 0)
);

-- =====================================================
-- 10. MOVIMENTACOES FINANCEIRAS DO CAIXA
-- =====================================================

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

    CONSTRAINT fk_movimentacao_caixa_caixa
        FOREIGN KEY (id_caixa)
        REFERENCES caixa(id_caixa),

    CONSTRAINT fk_movimentacao_caixa_venda
        FOREIGN KEY (id_venda)
        REFERENCES venda(id_venda),

    CONSTRAINT fk_movimentacao_caixa_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario),

    CONSTRAINT fk_movimentacao_caixa_forma
        FOREIGN KEY (id_forma_pagamento)
        REFERENCES forma_pagamento(id_forma_pagamento),

    CONSTRAINT chk_movimentacao_caixa_valor
        CHECK (valor > 0),

    CONSTRAINT uq_movimentacao_caixa_venda_forma
        UNIQUE (id_venda, id_forma_pagamento)
);

-- =====================================================
-- 11. MOVIMENTACOES DE ESTOQUE
-- =====================================================

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

    CONSTRAINT fk_movimentacao_produto
        FOREIGN KEY (id_produto)
        REFERENCES produto(id_produto),

    CONSTRAINT fk_movimentacao_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario),

    CONSTRAINT fk_movimentacao_venda
        FOREIGN KEY (id_venda)
        REFERENCES venda(id_venda),

    CONSTRAINT chk_movimentacao_quantidade
        CHECK (quantidade > 0)
);

-- =====================================================
-- 12. DADOS INICIAIS: TIPOS DE USUARIO
-- =====================================================

INSERT INTO tipo_usuario (id_tipo_usuario, nome, descricao) VALUES
(1, 'Administrador', 'Acesso administrativo ao sistema'),
(2, 'Gerente', 'Gerenciamento da operacao e relatorios'),
(3, 'Operador de Caixa', 'Registro de vendas e operacao do caixa'),
(4, 'Estoquista', 'Cadastro, entrada e ajuste de estoque')
ON DUPLICATE KEY UPDATE nome = VALUES(nome), descricao = VALUES(descricao);

-- =====================================================
-- 13. DADOS INICIAIS: CATEGORIAS DE PRODUTOS
-- =====================================================

INSERT INTO categoria (id_categoria, nome, descricao) VALUES
(1, 'Vestuário', 'Roupas e peças de vestuário'),
(2, 'Calçados', 'Calçados em geral'),
(3, 'Acessórios', 'Bolsas, cintos e acessórios'),
(4, 'Alimentos e Bebidas', 'Alimentos e bebidas'),
(5, 'Geral', 'Produtos e utilidades gerais')
ON DUPLICATE KEY UPDATE nome = VALUES(nome), descricao = VALUES(descricao);

-- =====================================================
-- 14. DADOS INICIAIS: FORMAS DE PAGAMENTO
-- =====================================================

INSERT INTO forma_pagamento (descricao) VALUES
('Dinheiro'),
('Pix'),
('Cartão de Débito'),
('Cartão de Crédito')
ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);

-- =====================================================
-- 15. USUARIO ADMINISTRADOR
-- =====================================================
-- O administrador é provisionado por initDb.js com ADMIN_INITIAL_PASSWORD.
-- Não insira credenciais padrão neste script.

-- =====================================================
-- 16. INDICES PARA CONSULTAS FREQUENTES
-- =====================================================

DROP PROCEDURE IF EXISTS criar_indice_se_ausente;
DELIMITER //
CREATE PROCEDURE criar_indice_se_ausente(
    IN tabela VARCHAR(64),
    IN indice VARCHAR(64),
    IN coluna VARCHAR(64)
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = tabela
          AND index_name = indice
    ) THEN
        SET @ddl_indice = CONCAT(
            'CREATE INDEX `', indice, '` ON `', tabela, '` (`', coluna, '`)'
        );
        PREPARE instrucao_indice FROM @ddl_indice;
        EXECUTE instrucao_indice;
        DEALLOCATE PREPARE instrucao_indice;
    END IF;
END//
DELIMITER ;

CALL criar_indice_se_ausente('venda', 'idx_venda_data', 'data_hora');
CALL criar_indice_se_ausente('venda', 'idx_venda_status', 'status');
CALL criar_indice_se_ausente('item_venda', 'idx_item_venda_venda', 'id_venda');
CALL criar_indice_se_ausente('item_venda', 'idx_item_venda_produto', 'id_produto');
CALL criar_indice_se_ausente('movimentacao_estoque', 'idx_movimentacao_data', 'data_hora');
CALL criar_indice_se_ausente('movimentacao_estoque', 'idx_movimentacao_produto', 'id_produto');
CALL criar_indice_se_ausente('produto', 'idx_produto_nome', 'nome');
DROP PROCEDURE criar_indice_se_ausente;
