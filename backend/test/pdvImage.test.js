const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');

const raizProjeto = path.resolve(__dirname, '../..');
const codigoPdv = fs.readFileSync(path.join(raizProjeto, 'frontend/js/pdv.js'), 'utf8');
const cssPdv = fs.readFileSync(path.join(raizProjeto, 'frontend/css/pdv.css'), 'utf8');

function renderizarProdutos(produtos) {
    const catalogo = { innerHTML: '' };
    const contexto = {
        document: {
            addEventListener() {},
            getElementById(id) {
                return id === 'listaProdutos' ? catalogo : null;
            }
        },
        escapeHtml(valor) {
            return String(valor ?? '').replace(/[&<>"']/g, '');
        },
        safeImageUrl(valor, fallback = 'icones/produtos.png') {
            return valor || fallback;
        },
        formatarMoeda(valor) {
            return `R$ ${Number(valor).toFixed(2)}`;
        },
        console
    };
    vm.runInNewContext(codigoPdv, contexto);
    contexto.renderizarCards(produtos);
    return catalogo.innerHTML;
}

test('PDV associa a imagem ao card do produto e usa placeholder sem imagem', () => {
    const html = renderizarProdutos([
        { id_produto: 7, nome: 'Produto com foto', foto: '/uploads/produto.jpg', estoque_atual: 2, preco_venda: 12.5 },
        { id_produto: 8, nome: 'Produto sem foto', foto: null, estoque_atual: 2, preco_venda: 8 }
    ]);

    assert.match(html, /src="\/uploads\/produto\.jpg"[^>]+product-image-photo/);
    assert.match(html, /alt="Produto com foto"/);
    assert.match(html, /src="icones\/produtos\.png"[^>]+product-image-placeholder/);
    assert.match(html, /class="product-price">R\$\s*12,50/);
    assert.match(html, /class="product-price">R\$\s*8,00/);
});

test('imagem usa a área existente do card sem alterar a altura do cabeçalho', () => {
    assert.match(cssPdv, /\.stock-card-header\s*\{[^}]*height:\s*135px/s);
    assert.match(cssPdv, /\.product-image\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*cover;/s);
    assert.match(cssPdv, /\.product-image-placeholder\s*\{\s*object-fit:\s*contain;/s);
});
