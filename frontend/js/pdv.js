// ==========================================================================
// PDV - FRENTE DE CAIXA: CONTROLE DE VENDAS E INTEGRAÇÃO DINÂMICA COM O BANCO
// ==========================================================================

let produtosCatalogo = [];
let carrinho = [];

// Formata valores numéricos para Moeda Brasileira (R$ 0,00)
function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
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
        produtosCatalogo = await api.get(url);

        renderizarCards(produtosCatalogo);
    } catch (erro) {
        console.error('Erro ao buscar produtos no banco:', erro);
        listaProdutos.innerHTML = `
            <div class="pdv-empty" style="color: #ef4444; border-color: #fca5a5;">
                Erro ao conectar ao banco de dados: ${erro.message}
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
        const imagemSrc = prod.foto || 'icones/produtos.png';

        html += `
            <div class="stock-card" onclick="adicionarAoCarrinho(${prod.id_produto})">
                <div class="stock-card-header">
                    <img src="${imagemSrc}" alt="${prod.nome}" class="product-image" onerror="this.src='icones/produtos.png'">
                    <span class="${statusClass}">${statusTexto}</span>
                </div>
                <div class="stock-card-body">
                    <span class="product-category">${prod.categoria_nome || 'Geral'}</span>
                    <h3 class="product-name" title="${prod.nome}">${prod.nome}</h3>
                    ${prod.codigo_barras ? `<span class="product-code">Cód: ${prod.codigo_barras}</span>` : ''}
                    <div class="product-stock">
                        Estoque: <strong>${estoqueAtual} ${prod.unidade_medida || 'UN'}</strong>
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
    carrinho = carrinho.filter(i => i.id_produto !== id_produto);
    atualizarTerminal();
}

function limparVenda() {
    if (carrinho.length === 0) return;

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
        const itemSubtotal = item.quantidade * item.preco_venda;
        totalGeral += itemSubtotal;
        totalItens += item.quantidade;

        html += `
            <tr>
                <td style="color: #94a3b8; font-weight: 600;">${index + 1}</td>
                <td>
                    <span class="terminal-item-name">${item.nome}</span>
                    ${item.codigo_barras ? `<span class="terminal-item-code">${item.codigo_barras}</span>` : ''}
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
                    ${formatarMoeda(itemSubtotal)}
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
    if (subtotalEl) subtotalEl.textContent = formatarMoeda(totalGeral);
    if (btnConfirmar) btnConfirmar.disabled = false;

    calcularTroco();
}

function calcularTroco() {
    const subtotalEl = document.getElementById('subtotal');
    const valorRecebidoInput = document.getElementById('valorRecebido');
    const trocoEl = document.getElementById('troco');
    const trocoContainer = document.getElementById('trocoContainer');

    if (!trocoEl) return;

    let subtotal = 0;
    carrinho.forEach(item => {
        subtotal += item.quantidade * item.preco_venda;
    });

    const valorRecebido = parseFloat(valorRecebidoInput?.value) || 0;

    if (valorRecebido > 0) {
        const troco = valorRecebido - subtotal;
        if (troco >= 0) {
            trocoEl.textContent = formatarMoeda(troco);
            trocoEl.style.color = '#15803d';
            if (trocoContainer) trocoContainer.querySelector('span').textContent = 'Troco:';
        } else {
            trocoEl.textContent = `Faltam ${formatarMoeda(Math.abs(troco))}`;
            trocoEl.style.color = '#dc2626';
            if (trocoContainer) trocoContainer.querySelector('span').textContent = 'Pendente:';
        }
    } else {
        trocoEl.textContent = 'R$ 0,00';
        trocoEl.style.color = '#15803d';
        if (trocoContainer) trocoContainer.querySelector('span').textContent = 'Troco:';
    }
}

// ==========================================================================
// 4. FINALIZAÇÃO DA VENDA COM INTEGRAÇÃO NO BACKEND
// ==========================================================================

async function confirmarVenda() {
    if (carrinho.length === 0) {
        alert('Adicione pelo menos um produto ao terminal antes de finalizar a venda.');
        return;
    }

    let subtotal = 0;
    carrinho.forEach(item => {
        subtotal += item.quantidade * item.preco_venda;
    });

    const formaPagamento = document.getElementById('formaPagamento')?.value || 'Dinheiro';
    const valorRecebidoInput = document.getElementById('valorRecebido');
    let valorRecebido = parseFloat(valorRecebidoInput?.value) || subtotal;

    // Se for dinheiro e informou valor menor que subtotal
    if (formaPagamento === 'Dinheiro' && valorRecebidoInput?.value && valorRecebido < subtotal) {
        alert(`O valor recebido (${formatarMoeda(valorRecebido)}) é menor que o total da venda (${formatarMoeda(subtotal)})!`);
        valorRecebidoInput.focus();
        return;
    }

    const usuario = auth.obterUsuario();
    const btnConfirmar = document.getElementById('confirmarVenda');
    if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Processando...';
    }

    try {
        const payload = {
            id_usuario: usuario?.id_usuario || 1,
            desconto: 0,
            forma_pagamento: formaPagamento,
            valor_recebido: valorRecebido,
            observacao: `Venda balcão - Operador: ${usuario?.nome || 'Admin'}`,
            itens: carrinho.map(i => ({
                id_produto: i.id_produto,
                quantidade: i.quantidade,
                preco_unitario: i.preco_venda
            }))
        };

        const resposta = await api.post('/api/vendas', payload);

        // Exibe recibo da venda no modal
        exibirReciboSucesso(resposta.venda, carrinho, formaPagamento);

        // Limpa carrinho e formulário
        carrinho = [];
        if (valorRecebidoInput) valorRecebidoInput.value = '';
        atualizarTerminal();

        // Recarrega os produtos do banco para que os estoques atualizados reflitam na tela!
        await carregarProdutos();

    } catch (erro) {
        alert(`Erro ao finalizar venda: ${erro.message}`);
    } finally {
        if (btnConfirmar) {
            btnConfirmar.disabled = carrinho.length === 0;
            btnConfirmar.textContent = '✓ Confirmar Venda';
        }
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
                <span>${item.quantidade}x ${item.nome}</span>
                <strong>${formatarMoeda(item.quantidade * item.preco_venda)}</strong>
            </div>
        `;
    });

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
        <div class="receipt-item-row" style="color: #64748b;">
            <span>Forma de Pagamento:</span>
            <span>${formaPagamento}</span>
        </div>
        ${formaPagamento === 'Dinheiro' && venda?.troco > 0 ? `
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
        inputRecebido.oninput = calcularTroco;
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
});

