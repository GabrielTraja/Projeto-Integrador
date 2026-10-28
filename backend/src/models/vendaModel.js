const db = require('../config/database');

const VendaModel = {
    async criarVenda(dadosVenda) {
        const {
            id_usuario = 1,
            desconto = 0,
            forma_pagamento = 'Dinheiro',
            valor_recebido = 0,
            observacao = 'Venda PDV Frente de Caixa',
            itens = []
        } = dadosVenda;

        if (!itens || itens.length === 0) {
            throw new Error('A venda deve conter pelo menos um item.');
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // 1. Garante que exista um caixa aberto
            const [caixasAbertos] = await connection.query(`
                SELECT id_caixa FROM caixa WHERE status = 'ABERTO' ORDER BY id_caixa DESC LIMIT 1
            `);

            let id_caixa;
            if (caixasAbertos.length > 0) {
                id_caixa = caixasAbertos[0].id_caixa;
            } else {
                // Cria um caixa aberto automaticamente caso não exista
                const [novoCaixa] = await connection.query(`
                    INSERT INTO caixa (valor_inicial, status, observacao, id_usuario_abertura)
                    VALUES (100.00, 'ABERTO', 'Caixa Aberto Automaticamente pelo PDV', ?)
                `, [id_usuario]);
                id_caixa = novoCaixa.insertId;
            }

            // 2. Calcula subtotal e valida itens
            let valor_subtotal = 0;
            const itensValidados = [];

            for (const item of itens) {
                const [prodRows] = await connection.query(`
                    SELECT id_produto, nome, preco_venda, estoque_atual, unidade_medida
                    FROM produto
                    WHERE id_produto = ?
                `, [item.id_produto]);

                if (prodRows.length === 0) {
                    throw new Error(`Produto ID ${item.id_produto} não encontrado.`);
                }

                const produto = prodRows[0];
                const quantidade = parseFloat(item.quantidade) || 1;
                const preco_unitario = parseFloat(item.preco_unitario !== undefined ? item.preco_unitario : produto.preco_venda);
                const subtotal_item = quantidade * preco_unitario;

                // Verifica estoque disponível
                if (parseFloat(produto.estoque_atual) < quantidade) {
                    throw new Error(`Estoque insuficiente para o produto "${produto.nome}". Disponível: ${produto.estoque_atual}`);
                }

                valor_subtotal += subtotal_item;
                itensValidados.push({
                    id_produto: produto.id_produto,
                    nome: produto.nome,
                    quantidade,
                    preco_unitario,
                    subtotal: subtotal_item
                });
            }

            const valor_desconto = parseFloat(desconto) || 0;
            const valor_total = Math.max(0, valor_subtotal - valor_desconto);

            // 3. Insere a Venda
            const [resultVenda] = await connection.query(`
                INSERT INTO venda (valor_subtotal, desconto, valor_total, status, observacao, id_usuario, id_caixa)
                VALUES (?, ?, ?, 'FINALIZADA', ?, ?, ?)
            `, [valor_subtotal, valor_desconto, valor_total, observacao, id_usuario, id_caixa]);

            const id_venda = resultVenda.insertId;

            // 4. Insere cada item da venda e atualiza o estoque do produto
            for (const item of itensValidados) {
                await connection.query(`
                    INSERT INTO item_venda (id_venda, id_produto, quantidade, preco_unitario, subtotal)
                    VALUES (?, ?, ?, ?, ?)
                `, [id_venda, item.id_produto, item.quantidade, item.preco_unitario, item.subtotal]);

                // Baixa de estoque
                await connection.query(`
                    UPDATE produto 
                    SET estoque_atual = estoque_atual - ?
                    WHERE id_produto = ?
                `, [item.quantidade, item.id_produto]);

                // Movimentação de estoque (SAÍDA)
                await connection.query(`
                    INSERT INTO movimentacao_estoque (id_produto, id_usuario, id_venda, tipo, quantidade, motivo)
                    VALUES (?, ?, ?, 'SAIDA', ?, 'Venda PDV Cupom #' ?)
                `, [item.id_produto, id_usuario, id_venda, item.quantidade, id_venda]);
            }

            // 5. Registra o pagamento (se forma_pagamento informada)
            const [formas] = await connection.query(`
                SELECT id_forma_pagamento FROM forma_pagamento WHERE LOWER(descricao) = LOWER(?) LIMIT 1
            `, [forma_pagamento]);

            const id_forma = formas.length > 0 ? formas[0].id_forma_pagamento : 1; // Padrão 1 (Dinheiro)

            await connection.query(`
                INSERT INTO pagamento (id_venda, id_forma_pagamento, valor, status)
                VALUES (?, ?, ?, 'APROVADO')
            `, [id_venda, id_forma, valor_total]);

            await connection.commit();

            return {
                id_venda,
                valor_subtotal,
                desconto: valor_desconto,
                valor_total,
                valor_recebido: parseFloat(valor_recebido) || valor_total,
                troco: Math.max(0, (parseFloat(valor_recebido) || valor_total) - valor_total),
                quantidade_itens: itensValidados.length,
                data_hora: new Date().toISOString()
            };
        } catch (erro) {
            await connection.rollback();
            throw erro;
        } finally {
            connection.release();
        }
    },

    async listarVendasRecentes(limite = 10) {
        const sql = `
            SELECT 
                v.id_venda,
                v.data_hora,
                v.valor_subtotal,
                v.desconto,
                v.valor_total,
                v.status,
                u.nome as usuario_nome
            FROM venda v
            INNER JOIN usuario u ON v.id_usuario = u.id_usuario
            ORDER BY v.id_venda DESC
            LIMIT ?
        `;
        const [rows] = await db.query(sql, [parseInt(limite, 10)]);
        return rows;
    }
};

module.exports = VendaModel;

