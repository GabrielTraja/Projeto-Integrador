// ==========================================================================
// PDV - FRENTE DE CAIXA: CONTROLE DE VENDAS E INTEGRAÇÃO DINÂMICA COM O BANCO
// ==========================================================================

let produtosCatalogo = [];
let carrinho = [];
let vendaEmProcessamento = false;

// Formata valores numéricos para Moeda Brasileira (R$ 0,00)
function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function paraCentavos(valor) {
    return Math.round(Number(valor) * 100);
}

function totalCarrinhoCentavos() {
    return carrinho.reduce((total, item) => (
        total + Math.round(paraCentavos(item.preco_venda) * item.quantidade)
    ), 0);
}

function exibirMensagemVenda(mensagem, tipo) {
    const elemento = document.getElementById('mensagemVenda');
    if (!elemento) return;
    elemento.textContent = mensagem;
    elemento.className = `pdv-venda-message pdv-venda-message-${tipo}`;
    elemento.hidden = false;
}

function limparMensagemVenda() {
    const elemento = document.getElementById('mensagemVenda');
    if (!elemento) return;
    elemento.textContent = '';
    elemento.hidden = true;
}

// ==========================================================================
// 1. CARREGAMENTO DINÂMICO DE PRODUTOS E CATEGORIAS DO BANCO DE DADOS
// ==========================================================================

async function carregarCategorias() {
    try {
        const categorias = await api.get('/api/categorias');
        const selectCat = document.getElementById('categoria');
        if (!selectCat) return;

        selectCat.innerHTML = '<option value="">Todas as categorias</option>';
        categorias.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id_categoria;
            opt.textContent = cat.nome;
            selectCat.appendChild(opt);
        });
    } catch (erro) {
        console.warn('Erro ao carregar categorias dinâmicas:', erro.message);
    }
}

async function carregarProdutos() {
    const listaProdutos = document.getElementById('listaProdutos');
    if (!listaProdutos) return;

    listaProdutos.innerHTML = `
        <div class="pdv-loading">
            <div class="spinner"></div>
            <span>Carregando produtos do banco de dados...</span>
        </div>
    `;

    try {
        const busca = document.getElementById('buscarProduto')?.value?.trim() || '';
        const categoria = document.getElementById('categoria')?.value || '';

        const params = new URLSearchParams();
        if (busca) params.append('busca', busca);
        if (categoria) params.append('categoria', categoria);

        const url = `/api/produtos${params.toString() ? '?' + params.toString() : ''}`;
        const produtos = await api.get(url);
        produtosCatalogo = produtos.filter(produto => produto.status === 'ATIVO');

        renderizarCards(produtosCatalogo);
    } catch (erro) {
        console.error('Erro ao buscar produtos no banco:', erro);
        listaProdutos.innerHTML = `
            <div class="pdv-empty" style="color: #ef4444; border-color: #fca5a5;">
                Erro ao conectar ao banco de dados: ${escapeHtml(erro.message)}
            </div>
        `;
    }
}

// ==========================================================================
// 2. RENDERIZAÇÃO DINÂMICA DOS CARDS DOS PRODUTOS
// ==========================================================================

function renderizarCards(produtos) {
    const listaProdutos = document.getElementById('listaProdutos');
    if (!listaProdutos) return;

    if (!produtos || produtos.length === 0) {
        listaProdutos.innerHTML = `
            <div class="pdv-empty">
                📦 Nenhum produto encontrado com os filtros selecionados.
            </div>
        `;
        return;
    }

    let html = '';
    produtos.forEach(prod => {
        const estoqueAtual = parseFloat(prod.estoque_atual) || 0;
        const estoqueMinimo = parseFloat(prod.estoque_minimo) || 0;
        const esgotado = estoqueAtual <= 0;
        const estoqueBaixo = !esgotado && estoqueAtual <= estoqueMinimo;

        let statusClass = 'stock-status';
        let statusTexto = 'Em Estoque';

        if (esgotado) {
            statusClass += ' status-out';
            statusTexto = 'Esgotado';
        } else if (estoqueBaixo) {
            statusClass += ' status-low';
            statusTexto = 'Estoque Baixo';
        }

        const precoFormatado = formatarMoeda(prod.preco_venda);
        const imagemSrc = escapeHtml(safeImageUrl(prod.foto));

        html += `
            <div class="stock-card" onclick="adicionarAoCarrinho(${prod.id_produto})">
                <div class="stock-card-header">
                    <img src="${imagemSrc}" alt="${escapeHtml(prod.nome)}" class="product-image ${prod.foto ? 'product-image-photo' : 'product-image-placeholder'}" onerror="this.onerror=null; this.src='icones/produtos.png'; this.classList.add('product-image-placeholder'); this.classList.remove('product-image-photo');">
                    <span class="${statusClass}">${statusTexto}</span>
                </div>
                <div class="stock-card-body">
                    <span class="product-category">${escapeHtml(prod.categoria_nome || 'Geral')}</span>
                    <h3 class="product-name" title="${escapeHtml(prod.nome)}">${escapeHtml(prod.nome)}</h3>
                    ${prod.codigo_barras ? `<span class="product-code">Cód: ${escapeHtml(prod.codigo_barras)}</span>` : ''}
                    <div class="product-stock">
                        Estoque: <strong>${estoqueAtual} ${escapeHtml(prod.unidade_medida || 'UN')}</strong>
                    </div>
                    <div class="product-price">${precoFormatado}</div>
                    <button 
                        type="button" 
                        class="btn-adicionar" 
                        ${esgotado ? 'disabled' : ''}
                        onclick="event.stopPropagation(); adicionarAoCarrinho(${prod.id_produto})"
                    >
                        ${esgotado ? 'Sem Estoque' : '+ Adicionar'}
                    </button>
                </div>
            </div>
        `;
    });

    listaProdutos.innerHTML = html;
}

// ==========================================================================
// 3. GERENCIAMENTO DO CARRINHO / TERMINAL DE VENDA
// ==========================================================================

function adicionarAoCarrinho(id_produto) {
    if (vendaEmProcessamento) return;
    const produto = produtosCatalogo.find(p => p.id_produto === id_produto);
    if (!produto) return;

    const estoqueMaximo = parseFloat(produto.estoque_atual) || 0;
    if (estoqueMaximo <= 0) {
        alert(`O produto "${produto.nome}" está esgotado no estoque!`);
        return;
    }

    const itemExistente = carrinho.find(item => item.id_produto === id_produto);

    if (itemExistente) {
        if (itemExistente.quantidade + 1 > estoqueMaximo) {
            alert(`Apenas ${estoqueMaximo} unidade(s) disponíveis em estoque para "${produto.nome}".`);
            return;
        }
        itemExistente.quantidade += 1;
    } else {
        carrinho.push({
            id_produto: produto.id_produto,
            nome: produto.nome,
            codigo_barras: produto.codigo_barras,
            preco_venda: parseFloat(produto.preco_venda),
            unidade_medida: produto.unidade_medida || 'UN',
            estoque_maximo: estoqueMaximo,
            quantidade: 1
        });
    }

    atualizarTerminal();
}

function adicionarPorCodigoBarras(codigo) {
    if (!codigo || !codigo.trim()) return;
    const cod = codigo.trim().toLowerCase();

    const produto = produtosCatalogo.find(p => 
        (p.codigo_barras && p.codigo_barras.toLowerCase() === cod) ||
        String(p.id_produto) === cod
    );

    if (produto) {
        adicionarAoCarrinho(produto.id_produto);
        const inputCod = document.getElementById('codigoBarras');
        if (inputCod) {
            inputCod.value = '';
            inputCod.focus();
        }
    } else {
        alert(`Produto com código "${codigo}" não encontrado no catálogo.`);
    }
}

function alterarQuantidade(id_produto, delta) {
    if (vendaEmProcessamento) return;
    const item = carrinho.find(i => i.id_produto === id_produto);
    if (!item) return;

    const novaQtd = item.quantidade + delta;

    if (novaQtd <= 0) {
        removerItem(id_produto);
        return;
    }

    if (novaQtd > item.estoque_maximo) {
        alert(`Estoque máximo atingido (${item.estoque_maximo} unidades).`);
        return;
    }

    item.quantidade = novaQtd;
    atualizarTerminal();
}

function removerItem(id_produto) {
    if (vendaEmProcessamento) return;
    carrinho = carrinho.filter(i => i.id_produto !== id_produto);
    atualizarTerminal();
}

function limparVenda() {
    if (carrinho.length === 0 || vendaEmProcessamento) return;

    if (confirm('Deseja realmente limpar todos os itens da compra atual?')) {
        carrinho = [];
        const valorRecebido = document.getElementById('valorRecebido');
        if (valorRecebido) valorRecebido.value = '';
        atualizarTerminal();
    }
}

// Atualiza a tabela do terminal e os totais financeiros
function atualizarTerminal() {
    const tbody = document.getElementById('itensVenda');
    const quantidadeItensEl = document.getElementById('quantidadeItens');
    const subtotalEl = document.getElementById('subtotal');
    const btnConfirmar = document.getElementById('confirmarVenda');

    if (!tbody) return;

    if (carrinho.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="terminal-empty">
                    🛒 Nenhum produto adicionado à compra.
                </td>
            </tr>
        `;
        if (quantidadeItensEl) quantidadeItensEl.textContent = '0';
        if (subtotalEl) subtotalEl.textContent = 'R$ 0,00';
        if (btnConfirmar) btnConfirmar.disabled = true;
        calcularTroco();
        return;
    }

    let html = '';
    let totalGeral = 0;
    let totalItens = 0;

    carrinho.forEach((item, index) => {
        const itemSubtotalCentavos = Math.round(paraCentavos(item.preco_venda) * item.quantidade);
        totalGeral += itemSubtotalCentavos;
        totalItens += item.quantidade;

        html += `
            <tr>
                <td style="color: #94a3b8; font-weight: 600;">${index + 1}</td>
                <td>
                    <span class="terminal-item-name">${escapeHtml(item.nome)}</span>
                    ${item.codigo_barras ? `<span class="terminal-item-code">${escapeHtml(item.codigo_barras)}</span>` : ''}
                </td>
                <td>
                    <div class="quantidade-controle">
                        <button type="button" onclick="alterarQuantidade(${item.id_produto}, -1)">-</button>
                        <span>${item.quantidade}</span>
                        <button type="button" onclick="alterarQuantidade(${item.id_produto}, 1)">+</button>
                    </div>
                </td>
                <td style="text-align: right; white-space: nowrap;">${formatarMoeda(item.preco_venda)}</td>
                <td style="text-align: right; font-weight: 700; color: #166534; white-space: nowrap;">
                    ${formatarMoeda(itemSubtotalCentavos / 100)}
                </td>
                <td style="text-align: center;">
                    <button 
                        type="button" 
                        class="btn-remover-item" 
                        title="Remover item"
                        onclick="removerItem(${item.id_produto})"
                    >
                        &times;
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    if (quantidadeItensEl) quantidadeItensEl.textContent = totalItens;
    if (subtotalEl) subtotalEl.textContent = formatarMoeda(totalGeral / 100);

    calcularTroco();
}

function calcularTroco() {
    const valorRecebidoInput = document.getElementById('valorRecebido');
    const trocoEl = document.getElementById('troco');
    const trocoContainer = document.getElementById('trocoContainer');
    const formaPagamento = document.getElementById('formaPagamento')?.value || 'Dinheiro';
    const btnConfirmar = document.getElementById('confirmarVenda');
    const labelRecebido = document.getElementById('valorRecebidoLabel');

    if (!trocoEl || !valorRecebidoInput) return;

    const totalCentavos = totalCarrinhoCentavos();
    const recebidoPreenchido = valorRecebidoInput.value.trim() !== '';
    const valorRecebido = Number(valorRecebidoInput.value);
    const recebidoValido = recebidoPreenchido && Number.isFinite(valorRecebido) && valorRecebido >= 0;
    const recebidoCentavos = recebidoValido ? paraCentavos(valorRecebido) : 0;
    const pagamentoEmDinheiro = formaPagamento === 'Dinheiro';
    const pagamentoValido = recebidoValido && (pagamentoEmDinheiro
        ? recebidoCentavos > 0
        : recebidoCentavos === totalCentavos);

    if (labelRecebido) {
        labelRecebido.textContent = pagamentoEmDinheiro ? 'Valor Recebido:' : 'Valor do Pagamento:';
    }
    if (trocoContainer) trocoContainer.hidden = !pagamentoEmDinheiro;

    if (pagamentoEmDinheiro && recebidoValido) {
        const trocoCentavos = recebidoCentavos - totalCentavos;
        if (trocoCentavos >= 0) {
            trocoEl.textContent = formatarMoeda(trocoCentavos / 100);
            trocoEl.style.color = '#15803d';
            if (trocoContainer) trocoContainer.querySelector('span').textContent = 'Troco:';
        } else {
            trocoEl.textContent = `Faltam ${formatarMoeda(Math.abs(trocoCentavos) / 100)}`;
            trocoEl.style.color = '#dc2626';
            if (trocoContainer) trocoContainer.querySelector('span').textContent = 'Pendente:';
        }
    } else {
        trocoEl.textContent = 'R$ 0,00';
        trocoEl.style.color = '#15803d';
        if (trocoContainer) trocoContainer.querySelector('span').textContent = 'Troco:';
    }

    if (btnConfirmar) {
        btnConfirmar.disabled = carrinho.length === 0 || !pagamentoValido || vendaEmProcessamento;
    }
}

// ==========================================================================
// 4. FINALIZAÇÃO DA VENDA COM INTEGRAÇÃO NO BACKEND
// ==========================================================================

async function confirmarVenda() {
    if (vendaEmProcessamento) return;
    if (carrinho.length === 0) {
        exibirMensagemVenda('Adicione pelo menos um produto ao terminal antes de finalizar a venda.', 'erro');
        return;
    }

    const totalCentavos = totalCarrinhoCentavos();
    const formaPagamento = document.getElementById('formaPagamento')?.value || 'Dinheiro';
    const valorRecebidoInput = document.getElementById('valorRecebido');
    const valorRecebido = Number(valorRecebidoInput?.value);
    const valorRecebidoCentavos = paraCentavos(valorRecebido);

    if (!valorRecebidoInput?.value.trim() || !Number.isFinite(valorRecebido) || valorRecebido < 0) {
        exibirMensagemVenda('Informe um valor recebido válido para concluir a venda.', 'erro');
        valorRecebidoInput?.focus();
        calcularTroco();
        return;
    }
    if (formaPagamento === 'Dinheiro' && valorRecebidoCentavos < totalCentavos) {
        if (valorRecebidoCentavos <= 0) {
            exibirMensagemVenda('Informe um valor em dinheiro maior que zero para dividir o pagamento.', 'erro');
            valorRecebidoInput.focus();
            return;
        }
        abrirModalPagamentoCombinado(valorRecebidoCentavos, totalCentavos);
        return;
    }
    if (formaPagamento !== 'Dinheiro' && valorRecebidoCentavos !== totalCentavos) {
        exibirMensagemVenda(`Para esta forma de pagamento, informe exatamente o total da venda (${formatarMoeda(totalCentavos / 100)}).`, 'erro');
        valorRecebidoInput.focus();
        calcularTroco();
        return;
    }

    await enviarVenda([
        { forma_pagamento: formaPagamento, valor: valorRecebidoCentavos / 100 }
    ], formaPagamento, valorRecebidoCentavos / 100);
}

function abrirModalPagamentoCombinado(valorDinheiroCentavos, totalCentavos) {
    const modal = document.getElementById('modalPagamentoCombinado');
    const dinheiroEl = document.getElementById('valorDinheiroCombinado');
    const saldoEl = document.getElementById('saldoCombinado');
    if (!modal || !dinheiroEl || !saldoEl) {
        exibirMensagemVenda('Não foi possível abrir as opções de pagamento combinado.', 'erro');
        return;
    }

    dinheiroEl.textContent = formatarMoeda(valorDinheiroCentavos / 100);
    saldoEl.textContent = formatarMoeda((totalCentavos - valorDinheiroCentavos) / 100);
    modal.classList.add('active');
    document.getElementById('formaPagamentoCombinado')?.focus();
}

function fecharModalPagamentoCombinado() {
    document.getElementById('modalPagamentoCombinado')?.classList.remove('active');
}

async function confirmarPagamentoCombinado() {
    if (vendaEmProcessamento) return;
    const totalCentavos = totalCarrinhoCentavos();
    const valorDinheiro = Number(document.getElementById('valorRecebido')?.value);
    const dinheiroCentavos = paraCentavos(valorDinheiro);
    const formaRestante = document.getElementById('formaPagamentoCombinado')?.value;

    if (!Number.isFinite(valorDinheiro) || dinheiroCentavos <= 0 || dinheiroCentavos >= totalCentavos) {
        fecharModalPagamentoCombinado();
        exibirMensagemVenda('O valor em dinheiro deve ser maior que zero e menor que o total atualizado.', 'erro');
        calcularTroco();
        return;
    }

    const saldoCentavos = totalCentavos - dinheiroCentavos;
    fecharModalPagamentoCombinado();
    await enviarVenda([
        { forma_pagamento: 'Dinheiro', valor: dinheiroCentavos / 100 },
        { forma_pagamento: formaRestante, valor: saldoCentavos / 100 }
    ], 'Dinheiro + ' + formaRestante, dinheiroCentavos / 100);
}

async function enviarVenda(pagamentos, formaPagamentoExibicao, valorRecebido) {
    const usuario = auth.obterUsuario();
    const btnConfirmar = document.getElementById('confirmarVenda');
    const valorRecebidoInput = document.getElementById('valorRecebido');
    vendaEmProcessamento = true;
    limparMensagemVenda();
    if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Processando...';
    }

    try {
        const payload = {
            id_usuario: usuario?.id_usuario,
            desconto: 0,
            forma_pagamento: pagamentos[0].forma_pagamento,
            valor_recebido: valorRecebido,
            pagamentos,
            observacao: `Venda balcão - Operador: ${usuario?.nome || 'Admin'}`,
            itens: carrinho.map(i => ({
                id_produto: i.id_produto,
                quantidade: i.quantidade,
                preco_unitario: i.preco_venda
            }))
        };

        const resposta = await api.post('/api/vendas', payload);

        // Exibe recibo da venda no modal
        exibirReciboSucesso(resposta.venda, carrinho, formaPagamentoExibicao);
        exibirMensagemVenda(`Venda #${resposta.venda.id_venda} concluída com sucesso.`, 'sucesso');

        // Limpa carrinho e formulário
        carrinho = [];
        if (valorRecebidoInput) valorRecebidoInput.value = '';
        atualizarTerminal();

        // Recarrega os produtos do banco para que os estoques atualizados reflitam na tela!
        await carregarProdutos();

    } catch (erro) {
        exibirMensagemVenda(`Erro ao finalizar venda: ${erro.message}`, 'erro');
    } finally {
        vendaEmProcessamento = false;
        if (btnConfirmar) {
            btnConfirmar.textContent = '✓ Confirmar Venda';
        }
        atualizarTerminal();
    }
}

function exibirReciboSucesso(venda, itensVendidos, formaPagamento) {
    const modal = document.getElementById('modalVendaSucesso');
    const reciboConteudo = document.getElementById('reciboConteudo');
    if (!modal || !reciboConteudo) {
        alert(`✓ Venda #${venda?.id_venda || ''} finalizada com sucesso!\nTotal: ${formatarMoeda(venda?.valor_total)}`);
        return;
    }

    let itensHtml = '';
    itensVendidos.forEach(item => {
        itensHtml += `
            <div class="receipt-item-row">
                <span>${item.quantidade}x ${escapeHtml(item.nome)}</span>
                <strong>${formatarMoeda(Math.round(paraCentavos(item.preco_venda) * item.quantidade) / 100)}</strong>
            </div>
        `;
    });

    const pagamentosVenda = Array.isArray(venda?.pagamentos) && venda.pagamentos.length > 0
        ? venda.pagamentos
        : [{ forma_pagamento: formaPagamento, valor: venda?.valor_total }];
    const pagamentosHtml = pagamentosVenda.map(pagamento => `
        <div class="receipt-item-row" style="color: #64748b;">
            <span>${escapeHtml(pagamento.forma_pagamento)}:</span>
            <span>${formatarMoeda(pagamento.valor)}</span>
        </div>
    `).join('');

    reciboConteudo.innerHTML = `
        <div style="text-align: center; margin-bottom: 15px; padding-bottom: 12px; border-bottom: 1px dashed #cbd5e1;">
            <h4 style="margin: 0; color: #0f172a; font-size: 16px;">Comprovante de Venda</h4>
            <span style="font-size: 12px; color: #64748b;">Cupom Não Fiscal #${venda?.id_venda || '1'}</span>
        </div>
        <div style="max-height: 180px; overflow-y: auto; margin-bottom: 12px;">
            ${itensHtml}
        </div>
        <div class="receipt-total-row">
            <span>Total:</span>
            <span>${formatarMoeda(venda?.valor_total)}</span>
        </div>
        ${pagamentosHtml}
        ${venda?.troco > 0 ? `
            <div class="receipt-item-row" style="color: #15803d; font-weight: 600;">
                <span>Troco:</span>
                <span>${formatarMoeda(venda.troco)}</span>
            </div>
        ` : ''}
    `;

    modal.classList.add('active');
}

function fecharModalRecibo() {
    const modal = document.getElementById('modalVendaSucesso');
    if (modal) modal.classList.remove('active');
}

// ==========================================================================
// 5. INICIALIZAÇÃO DE EVENTOS
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verifica autenticação do operador
    auth.verificarAutenticacao();

    // 2. Carrega categorias e produtos do banco de dados
    await carregarCategorias();
    await carregarProdutos();

    // 3. Evento de busca/filtro
    const formBuscar = document.getElementById('formBuscarProduto');
    if (formBuscar) {
        formBuscar.onsubmit = (e) => {
            e.preventDefault();
            carregarProdutos();
        };
    }

    const selectCategoria = document.getElementById('categoria');
    if (selectCategoria) {
        selectCategoria.onchange = () => carregarProdutos();
    }

    // Busca com delay ao digitar
    const inputBusca = document.getElementById('buscarProduto');
    let timeoutBusca;
    if (inputBusca) {
        inputBusca.oninput = () => {
            clearTimeout(timeoutBusca);
            timeoutBusca = setTimeout(carregarProdutos, 300);
        };
    }

    // 4. Evento do Leitor / Código de barras
    const inputCodigo = document.getElementById('codigoBarras');
    const btnCodigo = document.getElementById('adicionarPorCodigo');

    if (inputCodigo) {
        inputCodigo.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                adicionarPorCodigoBarras(inputCodigo.value);
            }
        };
    }

    if (btnCodigo && inputCodigo) {
        btnCodigo.onclick = () => adicionarPorCodigoBarras(inputCodigo.value);
    }

    // 5. Evento de limpeza do carrinho
    const btnLimpar = document.getElementById('limparVenda');
    if (btnLimpar) {
        btnLimpar.onclick = limparVenda;
    }

    // 6. Cálculo dinâmico de troco ao digitar valor recebido
    const inputRecebido = document.getElementById('valorRecebido');
    if (inputRecebido) {
        inputRecebido.oninput = () => {
            limparMensagemVenda();
            calcularTroco();
        };
        inputRecebido.onkeydown = (evento) => {
            if (evento.key === 'Enter') {
                evento.preventDefault();
                confirmarVenda();
            }
        };
    }

    const selectPagamento = document.getElementById('formaPagamento');
    if (selectPagamento) {
        selectPagamento.onchange = () => {
            limparMensagemVenda();
            calcularTroco();
        };
    }

    // 7. Confirmação de Venda
    const btnConfirmar = document.getElementById('confirmarVenda');
    if (btnConfirmar) {
        btnConfirmar.onclick = confirmarVenda;
    }

    // 8. Fechar Modal de Sucesso
    const btnFechar = document.getElementById('fecharModalSucesso');
    const btnNova = document.getElementById('btnNovaVenda');
    if (btnFechar) btnFechar.onclick = fecharModalRecibo;
    if (btnNova) btnNova.onclick = fecharModalRecibo;

    const btnFecharPagamento = document.getElementById('fecharPagamentoCombinado');
    const btnCancelarPagamento = document.getElementById('cancelarPagamentoCombinado');
    const btnConfirmarPagamento = document.getElementById('confirmarPagamentoCombinado');
    if (btnFecharPagamento) btnFecharPagamento.onclick = fecharModalPagamentoCombinado;
    if (btnCancelarPagamento) btnCancelarPagamento.onclick = fecharModalPagamentoCombinado;
    if (btnConfirmarPagamento) btnConfirmarPagamento.onclick = confirmarPagamentoCombinado;
});
