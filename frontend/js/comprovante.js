// Renderização compartilhada dos comprovantes térmicos de teste e de venda.
window.comprovante = {
    abrir(configuracao, venda, modo = 'venda') {
        const largura = Number(configuracao.largura_papel) === 58 ? 58 : 80;
        const quantidadeVias = modo === 'venda' ? Math.min(5, Math.max(1, Number(configuracao.quantidade_vias) || 1)) : 1;
        const janela = window.open('', '_blank', 'width=420,height=720');
        if (!janela) return false;

        const comprovantes = Array.from({ length: quantidadeVias }, (_, indice) =>
            montarComprovante(configuracao, venda, modo, indice + 1, quantidadeVias)
        ).join('');
        janela.document.open();
        janela.document.write(`<!doctype html>
            <html lang="pt-BR">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>${modo === 'venda' ? `Comprovante #${escapeHtml(venda.id_venda)}` : 'Pré-visualização do comprovante'}</title>
                <style>
                    @page { size: ${largura}mm auto; margin: 2mm; }
                    * { box-sizing: border-box; }
                    body { margin: 0; color: #201008; font: 12px/1.35 Arial, sans-serif; }
                    .toolbar { display: flex; gap: 8px; justify-content: center; padding: 12px; }
                    .toolbar button { border: 0; border-radius: 4px; padding: 9px 14px; cursor: pointer; }
                    .receipt { width: 100%; max-width: calc(${largura}mm - 4mm); margin: 0 auto; padding: 1mm; }
                    .receipt-copy { break-after: page; page-break-after: always; }
                    .receipt-copy:last-child { break-after: auto; page-break-after: auto; }
                    .center { text-align: center; }
                    .logo { display: block; max-width: 70%; max-height: 24mm; object-fit: contain; margin: 0 auto 5px; }
                    .name { font-size: 15px; font-weight: 700; }
                    .small { font-size: 10px; }
                    .muted { color: #502818; }
                    .rule { border: 0; border-top: 1px dashed #502818; margin: 7px 0; }
                    .meta { display: flex; justify-content: space-between; gap: 5px; }
                    .item { margin: 6px 0; overflow-wrap: anywhere; }
                    .item-name { font-weight: 600; }
                    .item-detail { display: flex; justify-content: space-between; gap: 5px; }
                    .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 14px; }
                    .message { margin-top: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
                    .demo { border: 1px dashed #502818; padding: 3px; margin-bottom: 5px; text-align: center; font-weight: 700; }
                    @media screen {
                        body { background: #F8F4F0; padding-bottom: 20px; }
                        .receipt-copy { background: #FFFFFF; margin: 10px auto; box-shadow: 0 1px 5px rgba(32, 16, 8, 0.18); }
                    }
                    @media print {
                        .toolbar { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="toolbar">
                    <button type="button" onclick="window.print()">Imprimir</button>
                    <button type="button" onclick="window.close()">Fechar</button>
                </div>
                ${comprovantes}
            </body>
            </html>`);
        janela.document.close();

        if (modo === 'venda' || modo === 'teste') {
            janela.addEventListener('load', () => {
                Promise.all(Array.from(janela.document.images, imagem =>
                    imagem.decode().catch(() => undefined)
                )).then(() => {
                    janela.focus();
                    janela.print();
                });
            }, { once: true });
        }
        return true;
    }
};

function montarComprovante(configuracao, venda, modo, numeroVia, totalVias) {
    const mostrar = campo => configuracao[campo] === true ||
        configuracao[campo] === 1 || configuracao[campo] === '1';
    const endereco = [
        [configuracao.endereco, configuracao.numero].filter(Boolean).join(', '),
        configuracao.complemento,
        configuracao.bairro,
        [configuracao.cidade, configuracao.estado].filter(Boolean).join(' - '),
        configuracao.cep
    ].filter(Boolean).join(' — ');
    const itens = (venda.itens || []).map(item => {
        const quantidade = Number(item.quantidade) || 0;
        const unitario = Number(item.preco_unitario ?? item.preco_venda) || 0;
        const subtotal = Number(item.subtotal) || Math.round(unitario * quantidade * 100) / 100;
        return `<div class="item">
            <div class="item-name">${escapeHtml(item.nome)} (${formatarQuantidade(quantidade)} x ${formatarMoeda(unitario)})</div>
            <div class="item-detail"><span>Subtotal</span><strong>${formatarMoeda(subtotal)}</strong></div>
        </div>`;
    }).join('');
    const pagamentos = Array.isArray(venda.pagamentos) && venda.pagamentos.length
        ? venda.pagamentos
        : [{ forma_pagamento: venda.forma_pagamento || '', valor: venda.valor_total }];
    const dataVenda = venda.data_hora ? new Date(venda.data_hora) : new Date();
    const dataFormatada = Number.isNaN(dataVenda.getTime())
        ? ''
        : dataVenda.toLocaleString('pt-BR');
    const logoValido = /^\/uploads\/[\da-f-]+\.(?:jpg|png|webp)$/i.test(configuracao.logotipo || '') ||
        /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(configuracao.logotipo || '');
    const logo = mostrar('exibir_logotipo') && logoValido
        ? `<img class="logo" src="${escapeHtml(configuracao.logotipo)}" alt="Logotipo">`
        : '';
    const linhasPagamento = mostrar('exibir_forma_pagamento')
        ? pagamentos.map(pagamento => `<div class="meta"><span>${escapeHtml(pagamento.forma_pagamento)}</span><span>${formatarMoeda(pagamento.valor)}</span></div>`).join('')
        : '';

    return `<article class="receipt receipt-copy">
        ${modo !== 'venda' ? '<div class="demo">PRÉVIA DE TESTE — DADOS DEMONSTRATIVOS</div>' : ''}
        ${logo}
        <header class="center">
            ${configuracao.nome_fantasia ? `<div class="name">${escapeHtml(configuracao.nome_fantasia)}</div>` : ''}
            ${configuracao.razao_social ? `<div>${escapeHtml(configuracao.razao_social)}</div>` : ''}
            ${mostrar('exibir_cnpj') && configuracao.cnpj ? `<div class="small">CNPJ: ${escapeHtml(configuracao.cnpj)}</div>` : ''}
            ${configuracao.inscricao_estadual ? `<div class="small">IE: ${escapeHtml(configuracao.inscricao_estadual)}</div>` : ''}
            ${mostrar('exibir_endereco') && endereco ? `<div class="small">${escapeHtml(endereco)}</div>` : ''}
            ${mostrar('exibir_telefone') && configuracao.telefone ? `<div class="small">${escapeHtml(configuracao.telefone)}</div>` : ''}
            ${configuracao.rede_social ? `<div class="small">${escapeHtml(configuracao.rede_social)}</div>` : ''}
        </header>
        <hr class="rule">
        <div class="center"><strong>COMPROVANTE NÃO FISCAL</strong></div>
        ${mostrar('exibir_numero_venda') ? `<div class="meta"><span>Venda</span><span>#${escapeHtml(venda.id_venda ?? 'Prévia')}</span></div>` : ''}
        ${mostrar('exibir_data_horario') ? `<div class="meta"><span>Data/hora</span><span>${escapeHtml(dataFormatada)}</span></div>` : ''}
        ${mostrar('exibir_operador') && venda.operador ? `<div class="meta"><span>Operador</span><span>${escapeHtml(venda.operador)}</span></div>` : ''}
        <hr class="rule">
        ${itens}
        <hr class="rule">
        ${Number(venda.desconto) > 0 ? `<div class="meta"><span>Desconto</span><span>-${formatarMoeda(venda.desconto)}</span></div>` : ''}
        <div class="total"><span>TOTAL</span><span>${formatarMoeda(venda.valor_total)}</span></div>
        ${linhasPagamento}
        ${mostrar('exibir_valor_recebido') && venda.valor_recebido !== undefined
            ? `<div class="meta"><span>Valor recebido</span><span>${formatarMoeda(venda.valor_recebido)}</span></div>` : ''}
        ${mostrar('exibir_troco') && Number(venda.troco) > 0
            ? `<div class="meta"><span>Troco</span><span>${formatarMoeda(venda.troco)}</span></div>` : ''}
        ${configuracao.mensagem_agradecimento ? `<div class="message center">${escapeHtml(configuracao.mensagem_agradecimento)}</div>` : ''}
        ${configuracao.mensagem_rodape ? `<div class="message center small">${escapeHtml(configuracao.mensagem_rodape)}</div>` : ''}
        ${totalVias > 1 ? `<div class="center small muted">Via ${numeroVia} de ${totalVias}</div>` : ''}
    </article>`;
}

function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[caractere]);
}

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarQuantidade(valor) {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}
