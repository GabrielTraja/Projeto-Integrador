const db = require('../config/database');

const formasPagamentoPermitidas = [
    'Dinheiro',
    'Pix',
    'Cartão de Débito',
    'Cartão de Crédito'
];

function normalizarFormaPagamento(valor) {
    return String(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const VendaModel = {
    async criarVenda(dadosVenda) {
        const {
            id_usuario = 1,
            desconto = 0,
            forma_pagamento = 'Dinheiro',
            valor_recebido,
            pagamentos: pagamentosInformados,
            observacao = 'Venda PDV Frente de Caixa',
            itens = []
        } = dadosVenda;

        const falhaValidacao = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });
        if (!Array.isArray(itens) || itens.length === 0) {
            throw falhaValidacao('A venda deve conter pelo menos um item.');
        }

        const descontoInformado = Number(desconto);
        const recebidoInformado = Number(valor_recebido);
        const entradaPagamentos = pagamentosInformados === undefined
            ? [{ forma_pagamento, valor: valor_recebido }]
            : pagamentosInformados;
        if (!Array.isArray(entradaPagamentos) || entradaPagamentos.length < 1) {
            throw falhaValidacao('Informe ao menos uma forma de pagamento.');
        }
        if (!Number.isFinite(descontoInformado) || descontoInformado < 0) {
            throw falhaValidacao('O desconto deve ser um valor válido e não negativo.');
        }
        if (pagamentosInformados === undefined && (!Number.isFinite(recebidoInformado) || recebidoInformado < 0)) {
            throw falhaValidacao('O valor recebido deve ser válido e não negativo.');
        }

        const pagamentosValidados = entradaPagamentos.map(pagamento => {
            const formaSelecionada = formasPagamentoPermitidas.find(
                forma => normalizarFormaPagamento(forma) === normalizarFormaPagamento(pagamento?.forma_pagamento || '')
            );
            const valorInformado = Number(pagamento?.valor);
            if (!formaSelecionada) {
                throw falhaValidacao('Forma de pagamento inválida. Utilize Dinheiro, Pix, Cartão de Débito ou Cartão de Crédito.');
            }
            if (!Number.isFinite(valorInformado) || valorInformado <= 0) {
                throw falhaValidacao('Cada valor de pagamento deve ser válido e maior que zero.');
            }
            const valorCentavos = Math.round(valorInformado * 100);
            if (valorCentavos <= 0) {
                throw falhaValidacao('Cada valor de pagamento deve ser de pelo menos R$ 0,01.');
            }
            return {
                forma_pagamento: formaSelecionada,
                valor_centavos: valorCentavos
            };
        });

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

                const precoCentavos = Math.round(Number(produto.preco_venda) * 100);
                const subtotalItemCentavos = Math.round(quantidade * precoCentavos);
                if (!Number.isFinite(precoCentavos) || precoCentavos < 0 || !Number.isFinite(subtotalItemCentavos)) {
                    throw falhaValidacao(`Preço inválido para o produto "${produto.nome}".`);
                }

                valor_subtotal += subtotalItemCentavos / 100;
                itensValidados.push({
                    id_produto: produto.id_produto,
                    nome: produto.nome,
                    quantidade,
                    preco_unitario: precoCentavos / 100,
                    subtotal: subtotalItemCentavos / 100
                });
            }

            const valorSubtotalCentavos = Math.round(valor_subtotal * 100);
            const valorDescontoCentavos = Math.round(descontoInformado * 100);
            if (valorSubtotalCentavos <= 0 || valorDescontoCentavos >= valorSubtotalCentavos) {
                throw falhaValidacao('O total da venda deve ser maior que zero e o desconto menor que o subtotal.');
            }
            valor_subtotal = valorSubtotalCentavos / 100;
            const valor_desconto = valorDescontoCentavos / 100;
            const valor_total = (valorSubtotalCentavos - valorDescontoCentavos) / 100;
            const totalCentavos = valorSubtotalCentavos - valorDescontoCentavos;
            const valorPagamentosCentavos = pagamentosValidados.reduce(
                (soma, pagamento) => soma + pagamento.valor_centavos,
                0
            );
            if (pagamentosValidados.length === 1) {
                const pagamento = pagamentosValidados[0];
                if (pagamento.forma_pagamento === 'Dinheiro' && pagamento.valor_centavos < totalCentavos) {
                    throw falhaValidacao('O valor recebido não pode ser menor que o total da venda em pagamentos somente em dinheiro.');
                }
                if (pagamento.forma_pagamento !== 'Dinheiro' && pagamento.valor_centavos !== totalCentavos) {
                    throw falhaValidacao('Para pagamentos por Pix ou cartão, o valor informado deve ser igual ao total da venda.');
                }
            } else if (valorPagamentosCentavos !== totalCentavos) {
                throw falhaValidacao('A soma dos pagamentos deve ser exatamente igual ao total da venda.');
            }

            for (const pagamento of pagamentosValidados) {
                const [formas] = await connection.query(`
                    SELECT id_forma_pagamento FROM forma_pagamento
                    WHERE LOWER(descricao) = LOWER(?) AND status = 'ATIVA' LIMIT 1
                `, [pagamento.forma_pagamento]);
                if (formas.length === 0) {
                    throw falhaValidacao('Forma de pagamento inválida ou inativa.');
                }
                pagamento.id_forma_pagamento = formas[0].id_forma_pagamento;
                pagamento.valor_registrado_centavos = pagamentosValidados.length === 1 &&
                    pagamento.forma_pagamento === 'Dinheiro'
                    ? totalCentavos
                    : pagamento.valor_centavos;
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

            const movimentacoesPorForma = new Map();
            for (const pagamento of pagamentosValidados) {
                const valorPagamento = pagamento.valor_registrado_centavos / 100;
                await connection.query(`
                    INSERT INTO pagamento (id_venda, id_forma_pagamento, valor, status)
                    VALUES (?, ?, ?, 'APROVADO')
                `, [id_venda, pagamento.id_forma_pagamento, valorPagamento]);

                const movimentoExistente = movimentacoesPorForma.get(pagamento.id_forma_pagamento);
                if (movimentoExistente) {
                    movimentoExistente.valor_centavos += pagamento.valor_registrado_centavos;
                } else {
                    movimentacoesPorForma.set(pagamento.id_forma_pagamento, {
                        forma_pagamento: pagamento.forma_pagamento,
                        id_forma_pagamento: pagamento.id_forma_pagamento,
                        valor_centavos: pagamento.valor_registrado_centavos
                    });
                }
            }

            for (const movimento of movimentacoesPorForma.values()) {
                await connection.query(`
                    INSERT INTO movimentacao_caixa
                        (id_caixa, id_venda, id_usuario, id_forma_pagamento, tipo, valor, descricao)
                    VALUES (?, ?, ?, ?, 'ENTRADA', ?, ?)
                `, [
                    id_caixa,
                    id_venda,
                    id_usuario,
                    movimento.id_forma_pagamento,
                    movimento.valor_centavos / 100,
                    `Venda PDV #${id_venda} - ${movimento.forma_pagamento}`
                ]);
            }

            await connection.commit();

            return {
                id_venda,
                valor_subtotal,
                desconto: valor_desconto,
                valor_total,
                valor_recebido: pagamentosValidados.length === 1 && pagamentosValidados[0].forma_pagamento === 'Dinheiro'
                    ? pagamentosValidados[0].valor_centavos / 100
                    : valorPagamentosCentavos / 100,
                troco: pagamentosValidados.length === 1 && pagamentosValidados[0].forma_pagamento === 'Dinheiro'
                    ? Math.max(0, pagamentosValidados[0].valor_centavos - totalCentavos) / 100
                    : 0,
                pagamentos: pagamentosValidados.map(pagamento => ({
                    forma_pagamento: pagamento.forma_pagamento,
                    valor: pagamento.valor_registrado_centavos / 100
                })),
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
