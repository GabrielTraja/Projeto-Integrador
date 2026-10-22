// ==========================================================================
// CRUD DE PRODUTOS - REAPROVEITAMENTO E ADAPTAÇÃO DO INDEX ANTERIOR
// ==========================================================================

let listaItens = [];
let categoriasDisponiveis = [];

// 1. Carrega dados da API e chama a renderização
async function carregarDados() {
    try {
        const busca = document.getElementById('buscarProduto')?.value || '';
        const categoria = document.getElementById('categoria')?.value || '';
        
        let url = '/api/produtos';
        const params = new URLSearchParams();
        if (busca) params.append('busca', busca);
        if (categoria) params.append('categoria', categoria);
        if (params.toString()) url += `?${params.toString()}`;

        listaItens = await api.get(url);
        mostrar();
    } catch (erro) {
        console.error('Erro ao carregar produtos:', erro);
        const tbody = document.querySelector('.stock-table tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: #ef4444; padding: 20px;">Erro ao carregar produtos: ${erro.message}</td></tr>`;
        }
    }
}

// 2. Função mostrar(): Renderiza os itens na tabela (Lógica adaptada do index.html)
function mostrar() {
    const tbody = document.querySelector('.stock-table tbody');
    if (!tbody) return;

    if (!listaItens || listaItens.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 30px; color: #64748b;">Nenhum produto cadastrado no momento.</td></tr>`;
        return;
    }

    let html = '';
    listaItens.forEach(item => {
        const estoqueAtual = parseFloat(item.estoque_atual) || 0;
        const estoqueMin = parseFloat(item.estoque_minimo) || 0;
        const estoqueBaixo = estoqueAtual <= estoqueMin;
        
        const precoCustoFormatado = Number(item.preco_custo || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const precoVendaFormatado = Number(item.preco_venda || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        html += `
            <tr class="${estoqueBaixo ? 'low-stock-row' : ''}">
                <td class="img-cell">
                    <img src="${item.foto || 'icones/produtos.png'}" alt="${item.nome}" class="product-img">
                </td>
                <td class="product-name">
                    ${item.nome}
                    ${item.codigo_barras ? `<br><span class="product-code">Cód: ${item.codigo_barras}</span>` : ''}
                </td>
                <td>${item.unidade_medida || 'UN'}</td>
                <td>${item.categoria_nome || 'Geral'}</td>
                <td>${precoCustoFormatado}</td>
                <td><strong>${precoVendaFormatado}</strong></td>
                <td>${estoqueMin}</td>
                <td><strong>${estoqueAtual}</strong></td>
                <td>
                    <span class="status ${estoqueBaixo ? 'status-warning' : 'status-ok'}">
                        ${estoqueBaixo ? 'Estoque Baixo' : 'Normal'}
                    </span>
                </td>
                <td class="actions-cell">
                    <button type="button" class="btn-action edit" title="Editar" onclick="editar(${item.id_produto})">✏️</button>
                    <button type="button" class="btn-action delete" title="Excluir" onclick="deletar(${item.id_produto})">🗑️</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// 3. Função salvarDados(): Cadastra ou atualiza o produto via formulário
async function salvarDados(event) {
    if (event) event.preventDefault();

    const id = new URLSearchParams(window.location.search).get('id');

    const nome = document.getElementById('nomeProduto')?.value?.trim();
    const unidade_medida = document.getElementById('unidade')?.value?.trim();
    const id_categoria = document.getElementById('categoria')?.value;
    const preco_custo = document.getElementById('precoCusto')?.value;
    const preco_venda = document.getElementById('precoVenda')?.value;
    const estoque_atual = document.getElementById('estoqueAtual')?.value;
    const estoque_minimo = document.getElementById('estoqueMinimo')?.value;
    const codigo_barras = document.getElementById('codigoBarras')?.value?.trim() || null;
    const descricao = document.getElementById('descricao')?.value?.trim() || null;

    if (!nome || !preco_venda) {
        alert('Por favor, preencha o Nome do Produto e o Preço de Venda.');
        return;
    }

    const payload = {
        nome,
        codigo_barras,
        unidade_medida: unidade_medida || 'UN',
        id_categoria: id_categoria ? parseInt(id_categoria, 10) : 1,
        preco_custo: parseFloat(preco_custo) || 0,
        preco_venda: parseFloat(preco_venda),
        estoque_atual: parseFloat(estoque_atual) || 0,
        estoque_minimo: parseFloat(estoque_minimo) || 0,
        descricao,
        status: 'ATIVO'
    };

    try {
        if (id) {
            // Edição
            await api.put(`/api/produtos/${id}`, payload);
            alert('Produto atualizado com sucesso!');
        } else {
            // Cadastro novo
            await api.post('/api/produtos', payload);
            alert('Produto cadastrado com sucesso!');
        }
        window.location.href = 'controleEstoque.html';
    } catch (erro) {
        alert(`Erro ao salvar produto: ${erro.message}`);
    }
}

// 4. Função editar(id): Redireciona para o formulário preenchendo os dados
function editar(id) {
    window.location.href = `cadastroProdutos.html?id=${id}`;
}

// 5. Preenche formulário caso seja tela de edição
async function carregarParaEdicao(id) {
    try {
        const produto = await api.get(`/api/produtos/${id}`);
        if (!produto) {
            alert('Produto não encontrado!');
            window.location.href = 'controleEstoque.html';
            return;
        }

        document.getElementById('nomeProduto').value = produto.nome || '';
        if (document.getElementById('codigoBarras')) {
            document.getElementById('codigoBarras').value = produto.codigo_barras || '';
        }
        document.getElementById('unidade').value = produto.unidade_medida || 'UN';
        if (document.getElementById('categoria')) {
            document.getElementById('categoria').value = produto.id_categoria || '1';
        }
        document.getElementById('precoCusto').value = produto.preco_custo || '';
        document.getElementById('precoVenda').value = produto.preco_venda || '';
        document.getElementById('estoqueAtual').value = produto.estoque_atual || '';
        document.getElementById('estoqueMinimo').value = produto.estoque_minimo || '';
        if (document.getElementById('descricao')) {
            document.getElementById('descricao').value = produto.descricao || '';
        }

        // Altera textos da página para modo Edição
        const titulo = document.querySelector('.welcome-section h1');
        if (titulo) titulo.textContent = 'Editar Produto';
        const subtitulo = document.querySelector('.welcome-section p');
        if (subtitulo) subtitulo.textContent = 'Atualize os dados do produto abaixo:';
        const btnSubmit = document.getElementById('cadastrarProduto');
        if (btnSubmit) btnSubmit.textContent = 'Atualizar Produto';

    } catch (erro) {
        alert(`Erro ao carregar dados do produto: ${erro.message}`);
        window.location.href = 'controleEstoque.html';
    }
}

// 6. Função deletar(id): Confirma e deleta via API (Lógica adaptada do index.html)
async function deletar(id) {
    const item = listaItens.find(obj => obj.id_produto === id);
    const nome = item ? item.nome : 'este produto';

    if (!confirm(`Tem certeza que deseja excluir "${nome}"?`)) {
        return;
    }

    try {
        await api.delete(`/api/produtos/${id}`);
        // Atualiza a lista local reaproveitando a lógica de filtro do index anterior
        listaItens = listaItens.filter(obj => obj.id_produto !== id);
        mostrar();
    } catch (erro) {
        alert(`Erro ao excluir produto: ${erro.message}`);
    }
}

// 7. Carrega lista de categorias para os selects
async function carregarCategoriasSelect() {
    try {
        categoriasDisponiveis = await api.get('/api/categorias');
        const select = document.getElementById('categoria');
        if (!select) return;

        const ehFiltro = select.classList.contains('select-category');
        select.innerHTML = ehFiltro 
            ? '<option value="">Todas as Categorias</option>' 
            : '<option value="">Selecione uma categoria...</option>';

        categoriasDisponiveis.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id_categoria;
            opt.textContent = cat.nome;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn('Não foi possível carregar categorias dinâmicas:', e.message);
    }
}

// Inicializações de acordo com a página
document.addEventListener('DOMContentLoaded', async () => {
    // Se estiver na tela de estoque
    if (document.querySelector('.stock-table')) {
        await carregarCategoriasSelect();
        await carregarDados();

        // Filtro em tempo real ou submit
        const searchForm = document.querySelector('.search-form');
        if (searchForm) {
            searchForm.onsubmit = (e) => {
                e.preventDefault();
                carregarDados();
            };
        }
        const selectCat = document.getElementById('categoria');
        if (selectCat) {
            selectCat.onchange = () => carregarDados();
        }
    }

    // Se estiver na tela de cadastro/edição de produtos
    const formProduto = document.querySelector('.product-form');
    if (formProduto) {
        await carregarCategoriasSelect();
        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('id');
        if (editId) {
            await carregarParaEdicao(editId);
        }
        formProduto.onsubmit = salvarDados;
    }
});

