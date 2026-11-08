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

        const falhaValidacao = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });
        if (!Array.isArray(itens) || itens.length === 0) {
            throw falhaValidacao('A venda deve conter pelo menos um item.');
        }

        const descontoInformado = Number(desconto);
        const recebidoInformado = Number(valor_recebido);
        if (!Number.isFinite(descontoInformado) || descontoInformado < 0) {
            throw falhaValidacao('O desconto deve ser um valor válido e não negativo.');
        }
        if (!Number.isFinite(recebidoInformado) || recebidoInformado < 0) {
            throw falhaValidacao('O valor recebido deve ser válido e não negativo.');
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
            const quantidadesReservadas = new Map();

            for (const item of itens) {
                const idProduto = Number(item.id_produto);
                const quantidade = Number(item.quantidade);
                if (!Number.isInteger(idProduto) || idProduto <= 0 ||
                    !Number.isFinite(quantidade) || quantidade <= 0 ||
                    Math.abs(quantidade * 1000 - Math.round(quantidade * 1000)) > 1e-7) {
                    throw falhaValidacao('Cada item deve ter um produto válido e uma quantidade maior que zero.');
                }

                const [prodRows] = await connection.query(`
                    SELECT id_produto, nome, preco_venda, estoque_atual, unidade_medida, status
                    FROM produto
                    WHERE id_produto = ?
                    FOR UPDATE
                `, [idProduto]);

                if (prodRows.length === 0) {
                    throw falhaValidacao(`Produto ID ${idProduto} não encontrado.`);
                }

                const produto = prodRows[0];
                if (produto.status !== 'ATIVO') {
                    throw falhaValidacao(`O produto "${produto.nome}" está inativo.`);
                }
                const quantidadeReservada = (quantidadesReservadas.get(idProduto) || 0) + quantidade;
                quantidadesReservadas.set(idProduto, quantidadeReservada);
                if (Number(produto.estoque_atual) < quantidadeReservada) {
                    throw falhaValidacao(`Estoque insuficiente para o produto "${produto.nome}". Disponível: ${produto.estoque_atual}`);
                }

                const preco_unitario = Number(produto.preco_venda);
                const subtotal_item = quantidade * preco_unitario;
                if (!Number.isFinite(preco_unitario) || preco_unitario < 0 || !Number.isFinite(subtotal_item)) {
                    throw falhaValidacao(`Preço inválido para o produto "${produto.nome}".`);
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

            const valor_desconto = descontoInformado;
            if (valor_subtotal <= 0 || valor_desconto >= valor_subtotal) {
                throw falhaValidacao('O total da venda deve ser maior que zero e o desconto menor que o subtotal.');
            }
            const valor_total = valor_subtotal - valor_desconto;
            if (recebidoInformado < valor_total) {
                throw falhaValidacao('O valor recebido não pode ser menor que o total da venda.');
            }

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
                const [resultUpdate] = await connection.query(`
                    UPDATE produto 
                    SET estoque_atual = estoque_atual - ?
                    WHERE id_produto = ? AND estoque_atual >= ?
                `, [item.quantidade, item.id_produto, item.quantidade]);
                if (resultUpdate.affectedRows !== 1) {
                    throw falhaValidacao(`Estoque insuficiente para o produto "${item.nome}".`);
                }

                // Movimentação de estoque (SAÍDA)
                await connection.query(`
                    INSERT INTO movimentacao_estoque (id_produto, id_usuario, id_venda, tipo, quantidade, motivo)
                    VALUES (?, ?, ?, 'SAIDA', ?, ?)
                `, [item.id_produto, id_usuario, id_venda, item.quantidade, `Venda PDV Cupom #${id_venda}`]);
            }

            // 5. Registra o pagamento (se forma_pagamento informada)
            const [formas] = await connection.query(`
                SELECT id_forma_pagamento FROM forma_pagamento
                WHERE LOWER(descricao) = LOWER(?) AND status = 'ATIVA' LIMIT 1
            `, [forma_pagamento]);

            if (formas.length === 0) {
                throw falhaValidacao('Forma de pagamento inválida ou inativa.');
            }
            const id_forma = formas[0].id_forma_pagamento;

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
                valor_recebido: recebidoInformado,
                troco: Math.max(0, recebidoInformado - valor_total),
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
        const quantidade = Number(limite);
        if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 100) {
            throw Object.assign(new Error('O limite deve ser um inteiro entre 1 e 100.'), { status: 400 });
        }
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
        const [rows] = await db.query(sql, [quantidade]);
        return rows;
    }
};

module.exports = VendaModel;
