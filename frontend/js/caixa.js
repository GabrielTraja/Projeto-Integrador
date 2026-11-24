let caixaAtual = null;
let resumoCaixaAtual = null;
let conferenciasPendentes = [];
let detalhesImpressao = null;
let relatorioFechamentoPendente = null;
let configuracaoImpressaoCaixa = null;
let carregandoPaginaCaixa = false;

function moedaCaixa(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataHoraCaixa(valor) {
    if (!valor) return '—';
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR');
}

function exibirMensagemCaixa(texto, tipo = 'success') {
    const mensagem = document.getElementById('mensagemCaixa');
    mensagem.textContent = texto;
    mensagem.className = `caixa-message caixa-message-${tipo}`;
    mensagem.hidden = false;
    mensagem.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function classeDiferenca(valor) {
    if (Number(valor) > 0) return 'difference-positive';
    if (Number(valor) < 0) return 'difference-negative';
    return 'difference-neutral';
}

function formaEhDinheiro(descricao) {
    return String(descricao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'dinheiro';
}

async function carregarPaginaCaixa() {
    const usuario = auth.verificarAutenticacao();
    if (!usuario) return;
    if (carregandoPaginaCaixa) return;
    carregandoPaginaCaixa = true;
    document.getElementById('operadorAbertura').textContent = usuario.nome || usuario.login;
    document.getElementById('secaoAbertura').hidden = true;
    try {
        const [caixa, historico] = await Promise.all([
            api.get('/api/caixa/atual'),
            api.get('/api/caixa/historico')
        ]);
        caixaAtual = caixa;
        renderizarCaixaAtual(caixa);
        renderizarHistorico(historico);
        if (caixa) await carregarMovimentacoes();
    } catch (erro) {
        exibirMensagemCaixa(`Não foi possível carregar os dados do caixa: ${erro.message}`, 'error');
    } finally {
        carregandoPaginaCaixa = false;
    }
}

function renderizarCaixaAtual(caixa) {
    const secaoAtual = document.getElementById('secaoAtual');
    const secaoMovimentacoes = document.getElementById('secaoMovimentacoes');
    const secaoFechamento = document.getElementById('secaoFechamento');
    const secaoAbertura = document.getElementById('secaoAbertura');
    if (!caixa) {
        secaoAtual.hidden = true;
        secaoMovimentacoes.hidden = true;
        secaoFechamento.hidden = true;
        secaoAbertura.hidden = false;
        resumoCaixaAtual = null;
        limparConferencia();
        return;
    }

    secaoAbertura.hidden = true;
    secaoAtual.hidden = false;
    secaoMovimentacoes.hidden = false;
    secaoFechamento.hidden = false;
    document.getElementById('numeroCaixa').textContent = `#${caixa.id_caixa}`;
    document.getElementById('operadorAtual').textContent = caixa.operador_abertura || '—';
    document.getElementById('dataAbertura').textContent = dataHoraCaixa(caixa.data_abertura);
    resumoCaixaAtual = caixa;

    const indicadores = [
        ['Valor inicial', caixa.valor_inicial],
        ['Total de vendas', caixa.total_vendas],
        ['Total de entradas registradas', Number(caixa.total_vendas) + Number(caixa.suprimentos)],
        ['Vendas em dinheiro', caixa.total_dinheiro_vendido],
        ['Suprimentos', caixa.suprimentos],
        ['Sangrias', caixa.sangrias],
        ['Despesas', caixa.despesas],
        ['Saldo esperado em dinheiro', caixa.saldo_esperado_dinheiro, 'metric-expected']
    ];
    document.getElementById('indicadoresCaixa').innerHTML = indicadores.map(([titulo, valor, classe = '']) => `
        <div class="metric-card ${classe}">
            <span>${escapeHtml(titulo)}</span>
            <strong>${moedaCaixa(valor)}</strong>
        </div>
    `).join('');

    const resumoPagamentos = document.getElementById('resumoPagamentos');
    resumoPagamentos.innerHTML = caixa.pagamentos.map(pagamento => `
        <tr>
            <td>${escapeHtml(pagamento.descricao)}</td>
            <td>${Number(pagamento.quantidade_vendas || 0)}</td>
            <td>${moedaCaixa(pagamento.total_vendido)}</td>
            <td class="payment-method-note">${formaEhDinheiro(pagamento.descricao) ? 'Conta no dinheiro físico' : 'Recebimento fora da gaveta'}</td>
        </tr>
    `).join('') || '<tr><td colspan="4">Nenhuma forma de pagamento ativa.</td></tr>';

    const containerConferencia = document.getElementById('camposConferencia');
    // Só reaproveita valores digitados se ainda for a mesma sessão de caixa.
    const mesmaSessao = containerConferencia.dataset.caixaId === String(caixa.id_caixa);
    const valoresDigitados = new Map(
        mesmaSessao
            ? [...containerConferencia.querySelectorAll('input[data-forma-id]')]
                .filter(campo => campo.value !== '')
                .map(campo => [campo.dataset.formaId, campo.value])
            : []
    );
    containerConferencia.dataset.caixaId = String(caixa.id_caixa);
    const formasConferencia = caixa.pagamentos.map(pagamento => ({
        pagamento,
        esperado: Number(formaEhDinheiro(pagamento.descricao)
            ? caixa.saldo_esperado_dinheiro
            : pagamento.total_vendido) || 0
    }));
    // Formas sem movimento (esperado 0,00) não exigem digitação: são conferidas automaticamente com 0,00.
    const formasComMovimento = formasConferencia.filter(({ esperado }) => Math.round(esperado * 100) !== 0);
    containerConferencia.innerHTML = formasComMovimento.map(({ pagamento, esperado }) => {
        return `
            <label class="count-field" for="conferencia-${Number(pagamento.id_forma_pagamento)}">
                <span>${escapeHtml(pagamento.descricao)} <small>Esperado: ${moedaCaixa(esperado)}</small></span>
                <input type="number" id="conferencia-${Number(pagamento.id_forma_pagamento)}"
                    name="forma-${Number(pagamento.id_forma_pagamento)}" min="0" max="9999999999.99"
                    step="0.01" data-forma-id="${Number(pagamento.id_forma_pagamento)}"
                    data-forma-nome="${escapeHtml(pagamento.descricao)}" data-esperado="${Number(esperado)}"
                    placeholder="Valor conferido" required>
            </label>
        `;
    }).join('') || '<p class="detail-note">Nenhuma forma de pagamento teve movimento nesta sessão. Não há valores a conferir.</p>';
    for (const campo of containerConferencia.querySelectorAll('input[data-forma-id]')) {
        if (valoresDigitados.has(campo.dataset.formaId)) {
            campo.value = valoresDigitados.get(campo.dataset.formaId);
        }
    }
}

async function carregarMovimentacoes() {
    if (!caixaAtual) return;
    const formulario = new FormData(document.getElementById('filtrosMovimentacoes'));
    const parametros = new URLSearchParams();
    for (const chave of ['tipo', 'inicio', 'fim']) {
        const valor = formulario.get(chave);
        if (valor) parametros.set(chave, valor);
    }
    const query = parametros.toString();
    try {
        const movimentacoes = await api.get(
            `/api/caixa/${caixaAtual.id_caixa}/movimentacoes${query ? `?${query}` : ''}`
        );
        const tabela = document.getElementById('tabelaMovimentacoes');
        tabela.innerHTML = movimentacoes.map(movimento => `
            <tr>
                <td>${dataHoraCaixa(movimento.data_hora)}</td>
                <td>${escapeHtml(movimento.tipo)}</td>
                <td>${escapeHtml(movimento.descricao)}</td>
                <td>${escapeHtml(movimento.categoria || '—')}</td>
                <td>${escapeHtml(movimento.responsavel)}</td>
                <td class="amount-cell">${moedaCaixa(movimento.valor)}</td>
            </tr>
        `).join('') || '<tr><td colspan="6">Nenhuma movimentação encontrada para os filtros selecionados.</td></tr>';
    } catch (erro) {
        exibirMensagemCaixa(`Não foi possível carregar as movimentações: ${erro.message}`, 'error');
    }
}

function renderizarHistorico(caixas) {
    const tabela = document.getElementById('tabelaHistorico');
    tabela.innerHTML = caixas.map(caixa => `
        <tr>
            <td>#${Number(caixa.id_caixa)}</td>
            <td>${escapeHtml(caixa.operador_abertura || '—')}</td>
            <td>${dataHoraCaixa(caixa.data_abertura)}</td>
            <td>${dataHoraCaixa(caixa.data_fechamento)}</td>
            <td>${moedaCaixa(caixa.valor_inicial)}</td>
            <td>${moedaCaixa(caixa.total_vendas)}</td>
            <td>${caixa.valor_final === null ? '—' : moedaCaixa(caixa.valor_final)}</td>
            <td class="${classeDiferenca(caixa.diferenca_total)}">${caixa.status === 'FECHADO' ? moedaCaixa(caixa.diferenca_total) : '—'}</td>
            <td><span class="status-text">${escapeHtml(caixa.status)}</span></td>
            <td><button class="btn-view-close" type="button" data-detalhes-id="${Number(caixa.id_caixa)}">Detalhes</button></td>
        </tr>
    `).join('') || '<tr><td colspan="10">Ainda não há sessões de caixa registradas.</td></tr>';
}

async function atualizarHistorico() {
    try {
        renderizarHistorico(await api.get('/api/caixa/historico'));
    } catch (erro) {
        exibirMensagemCaixa(`Não foi possível atualizar o histórico: ${erro.message}`, 'error');
    }
}

function limparConferencia() {
    const container = document.getElementById('camposConferencia');
    container.innerHTML = '';
    delete container.dataset.caixaId;
    conferenciasPendentes = [];
    relatorioFechamentoPendente = null;
    document.getElementById('resumoConferencia').innerHTML = '';
}

function prepararRevisaoFechamento(evento) {
    evento.preventDefault();
    if (!resumoCaixaAtual) return;
    const campos = [...document.querySelectorAll('#camposConferencia input[data-forma-id]')];
    if (campos.some(campo => campo.value === '' || !campo.validity.valid)) {
        exibirMensagemCaixa('Informe um valor conferido válido para cada forma de pagamento com movimento.', 'error');
        return;
    }

    const camposPorForma = new Map(campos.map(campo => [Number(campo.dataset.formaId), campo]));
    // Envia todas as formas ativas (exigido pelo backend); as sem movimento vão com 0,00.
    conferenciasPendentes = resumoCaixaAtual.pagamentos.map(pagamento => {
        const id = Number(pagamento.id_forma_pagamento);
        const campo = camposPorForma.get(id);
        const esperado = campo
            ? Number(campo.dataset.esperado)
            : Number(formaEhDinheiro(pagamento.descricao)
                ? resumoCaixaAtual.saldo_esperado_dinheiro
                : pagamento.total_vendido) || 0;
        const informado = campo ? Number(campo.value) : 0;
        return {
            id_forma_pagamento: id,
            descricao: pagamento.descricao,
            valor_informado: informado,
            valor_esperado: esperado,
            esperado,
            diferenca: Math.round((informado - esperado) * 100) / 100,
            semMovimento: !campo
        };
    });

    const janelaRelatorio = window.open('', '_blank', 'width=1000,height=800');
    if (janelaRelatorio) {
        janelaRelatorio.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Preparando resumo do caixa</title></head><body><p>Carregando resumo de vendas...</p></body></html>');
        janelaRelatorio.document.close();
        janelaRelatorio.opener = null;
    }

    const botaoRevisao = document.getElementById('btnRevisarFechamento');
    botaoRevisao.disabled = true;
    carregarRelatorioDaSessao(janelaRelatorio).then(() => {
        document.getElementById('modalConferencia').classList.add('active');
    }).catch(erro => {
        if (janelaRelatorio && !janelaRelatorio.closed) janelaRelatorio.close();
        exibirMensagemCaixa(`Não foi possível gerar o relatório do período: ${erro.message}`, 'error');
    }).finally(() => {
        botaoRevisao.disabled = false;
    });

    const resumo = resumoCaixaAtual;
    const itensResumo = [
        ['Valor inicial', resumo.valor_inicial],
        ['Vendas em dinheiro', resumo.total_dinheiro_vendido],
        ['Suprimentos', resumo.suprimentos],
        ['Sangrias', resumo.sangrias],
        ['Despesas pagas em dinheiro', resumo.despesas],
        ['Saldo esperado em dinheiro', resumo.saldo_esperado_dinheiro]
    ];
    const linhasResumo = itensResumo.map(([rotulo, valor]) => `
        <div class="review-row"><span>${escapeHtml(rotulo)}</span><strong>${moedaCaixa(valor)}</strong></div>
    `).join('');
    const linhasConferencia = conferenciasPendentes.filter(item => !item.semMovimento).map(item => `
        <div class="review-row">
            <span>${escapeHtml(item.descricao)} · Esperado ${moedaCaixa(item.esperado)}</span>
            <strong>${moedaCaixa(item.valor_informado)} <small class="${classeDiferenca(item.diferenca)}">(${item.diferenca > 0 ? '+' : ''}${moedaCaixa(item.diferenca)})</small></strong>
        </div>
    `).join('') || '<p class="detail-note">Nenhuma forma de pagamento com movimento.</p>';
    const totalDiferenca = conferenciasPendentes.reduce((total, item) => total + item.diferenca, 0);
    document.getElementById('resumoConferencia').innerHTML = `
        <div class="review-list">
            ${linhasResumo}
            <h4 class="detail-subheading">Valores informados pelo operador</h4>
            ${linhasConferencia}
            <div class="review-row review-total">
                <strong>Diferença total</strong>
                <strong class="${classeDiferenca(totalDiferenca)}">${moedaCaixa(totalDiferenca)}</strong>
            </div>
        </div>
        <p class="detail-note">Ao confirmar, a sessão será encerrada e não aceitará novas vendas ou movimentações.</p>
    `;
}

async function carregarRelatorioDaSessao(janelaRelatorio) {
    const [caixa, configuracao] = await Promise.all([
        api.get(`/api/caixa/${caixaAtual.id_caixa}`),
        api.get('/api/configuracoes/estabelecimento')
    ]);
    const usuario = auth.obterUsuario();
    const geradoEm = new Date().toISOString();
    relatorioFechamentoPendente = {
        caixa,
        configuracao,
        conferencias: conferenciasPendentes,
        funcionario: usuario?.nome || usuario?.login || '—',
        loginFuncionario: usuario?.login || '',
        geradoEm,
        dataHoraFechamentoRelatorio: geradoEm
    };
    configuracaoImpressaoCaixa = configuracao;
    if (janelaRelatorio && !janelaRelatorio.closed) {
        escreverRelatorioImpressao(janelaRelatorio, relatorioFechamentoPendente);
    } else {
        exibirMensagemCaixa(
            'O navegador bloqueou a janela de impressão. Use “Imprimir resumo” na conferência.',
            'error'
        );
    }
}

async function confirmarFechamentoCaixa() {
    const botao = document.getElementById('confirmarFechamento');
    botao.disabled = true;
    try {
        await api.post(`/api/caixa/${caixaAtual.id_caixa}/fechamento`, {
            conferencias: conferenciasPendentes.map(({ id_forma_pagamento, valor_informado, valor_esperado }) => ({
                id_forma_pagamento,
                valor_informado,
                valor_esperado
            }))
        });
        document.getElementById('modalConferencia').classList.remove('active');
        exibirMensagemCaixa(`Caixa #${caixaAtual.id_caixa} fechado e conferência registrada.`, 'success');
        limparConferencia();
        await carregarPaginaCaixa();
    } catch (erro) {
        exibirMensagemCaixa(`Não foi possível fechar o caixa: ${erro.message}`, 'error');
        if (erro.message.includes('mudaram durante a conferência')) {
            document.getElementById('modalConferencia').classList.remove('active');
            await carregarPaginaCaixa();
        }
    } finally {
        botao.disabled = false;
    }
}

function mostrarDetalhes(caixa) {
    detalhesImpressao = caixa;
    const pagamentos = caixa.pagamentos.map(pagamento => `
        <div class="detail-row">
            <span>${escapeHtml(pagamento.descricao)} · Esperado ${moedaCaixa(pagamento.valor_esperado)}</span>
            <strong>${moedaCaixa(pagamento.valor_informado)} <small class="${classeDiferenca(pagamento.diferenca)}">(${moedaCaixa(pagamento.diferenca)})</small></strong>
        </div>
    `).join('');
    const movimentacoes = caixa.movimentacoes.map(movimento => `
        <div class="detail-row">
            <span>${dataHoraCaixa(movimento.data_hora)} · ${escapeHtml(movimento.tipo)} · ${escapeHtml(movimento.descricao)} · ${escapeHtml(movimento.responsavel)}</span>
            <strong>${moedaCaixa(movimento.valor)}</strong>
        </div>
    `).join('') || '<p class="detail-note">Nenhuma movimentação manual nesta sessão.</p>';

    document.getElementById('conteudoDetalhes').innerHTML = `
        <div class="detail-list">
            <div class="detail-row"><span>Status</span><strong>${escapeHtml(caixa.status)}</strong></div>
            <div class="detail-row"><span>Operador de abertura</span><strong>${escapeHtml(caixa.operador_abertura)}</strong></div>
            <div class="detail-row"><span>Operador de fechamento</span><strong>${escapeHtml(caixa.operador_fechamento || '—')}</strong></div>
            <div class="detail-row"><span>Abertura</span><strong>${dataHoraCaixa(caixa.data_abertura)}</strong></div>
            <div class="detail-row"><span>Fechamento</span><strong>${dataHoraCaixa(caixa.data_fechamento)}</strong></div>
            <div class="detail-row"><span>Valor inicial</span><strong>${moedaCaixa(caixa.valor_inicial)}</strong></div>
            <div class="detail-row"><span>Total vendido</span><strong>${moedaCaixa(caixa.total_vendas)}</strong></div>
            <div class="detail-row"><span>Vendas em dinheiro</span><strong>${moedaCaixa(caixa.total_dinheiro_vendido)}</strong></div>
            <div class="detail-row"><span>Suprimentos</span><strong>${moedaCaixa(caixa.total_suprimentos ?? caixa.suprimentos)}</strong></div>
            <div class="detail-row"><span>Sangrias</span><strong>${moedaCaixa(caixa.total_sangrias ?? caixa.sangrias)}</strong></div>
            <div class="detail-row"><span>Despesas</span><strong>${moedaCaixa(caixa.total_despesas ?? caixa.despesas)}</strong></div>
            <div class="detail-row"><span>Saldo esperado em dinheiro</span><strong>${moedaCaixa(caixa.saldo_esperado_dinheiro)}</strong></div>
            <div class="detail-row"><span>Saldo informado em dinheiro</span><strong>${caixa.saldo_informado_dinheiro === null ? '—' : moedaCaixa(caixa.saldo_informado_dinheiro)}</strong></div>
            <div class="detail-row"><span>Diferença total</span><strong class="${classeDiferenca(caixa.diferenca_total)}">${caixa.diferenca_total === null ? '—' : moedaCaixa(caixa.diferenca_total)}</strong></div>
        </div>
        <h4 class="detail-subheading">Conferência por forma de pagamento</h4>
        <div class="detail-list">${pagamentos || '<p class="detail-note">Caixa ainda não fechado.</p>'}</div>
        <h4 class="detail-subheading">Movimentações registradas</h4>
        <div class="detail-list">${movimentacoes}</div>
        <p class="detail-note">Resumo gerencial não fiscal.</p>
    `;
    document.getElementById('modalDetalhes').classList.add('active');
}

async function abrirDetalhesCaixa(id) {
    try {
        mostrarDetalhes(await api.get(`/api/caixa/${id}`));
    } catch (erro) {
        exibirMensagemCaixa(`Não foi possível carregar os detalhes: ${erro.message}`, 'error');
    }
}

async function imprimirDetalhesCaixa() {
    if (!detalhesImpressao) return;
    const janela = window.open('', '_blank', 'width=800,height=700');
    if (!janela) {
        exibirMensagemCaixa('Permita a abertura de janelas para imprimir o resumo.', 'error');
        return;
    }
    janela.opener = null;
    try {
        if (!configuracaoImpressaoCaixa) {
            configuracaoImpressaoCaixa = await api.get('/api/configuracoes/estabelecimento');
        }
    } catch (erro) {
        janela.close();
        exibirMensagemCaixa(`Não foi possível carregar o formato de impressão: ${erro.message}`, 'error');
        return;
    }
    const usuario = auth.obterUsuario();
    escreverRelatorioImpressao(janela, {
        caixa: detalhesImpressao,
        configuracao: configuracaoImpressaoCaixa,
        conferencias: [],
        funcionario: usuario?.nome || detalhesImpressao.operador_fechamento || '—',
        loginFuncionario: usuario?.login || '',
        geradoEm: new Date().toISOString()
    });
}

function imprimirRelatorioFechamentoPendente() {
    if (!relatorioFechamentoPendente) {
        exibirMensagemCaixa('O relatório da sessão ainda não está disponível. Tente revisar o fechamento novamente.', 'error');
        return;
    }
    const janela = window.open('', '_blank', 'width=1000,height=800');
    if (!janela) {
        exibirMensagemCaixa('Permita a abertura de janelas para imprimir o relatório.', 'error');
        return;
    }
    janela.opener = null;
    escreverRelatorioImpressao(janela, relatorioFechamentoPendente);
}

function escreverRelatorioImpressao(janela, dados) {
    const { caixa, configuracao, funcionario, loginFuncionario } = dados;
    const largura = Number(configuracao?.largura_papel) === 58 ? 58 : 80;
    const dataHoraFechamento = caixa.data_fechamento || dados.dataHoraFechamentoRelatorio;
    const totaisPorForma = new Map();
    for (const venda of caixa.vendas || []) {
        if (venda.status !== 'FINALIZADA') continue;
        for (const pagamento of venda.pagamentos || []) {
            if (pagamento.status !== 'APROVADO' || !pagamento.forma_pagamento) continue;
            const forma = pagamento.forma_pagamento;
            totaisPorForma.set(
                forma,
                (totaisPorForma.get(forma) || 0) + Math.round(Number(pagamento.valor) * 100)
            );
        }
    }

    const formasPagamento = [...totaisPorForma.entries()];
    const totalVendasCentavos = Math.round(Number(caixa.total_vendas || 0) * 100);
    const blocosPagamento = formasPagamento.map(([forma, valor]) => `
        <section class="payment">
            <div class="payment-name">${escapeHtml(forma)}</div>
            <div class="payment-total">${moedaCaixa(valor / 100)}</div>
        </section>
    `).join('');

    janela.document.open();
    janela.document.write(`<!doctype html>
        <html lang="pt-BR">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Fechamento de caixa</title>
            <style>
                @page { size: ${largura}mm auto; margin: 2mm; }
                * { box-sizing: border-box; }
                body { width: 100%; margin: 0; color: #201008; font: 12px/1.3 Arial, sans-serif; }
                .receipt { width: 100%; max-width: calc(${largura}mm - 4mm); margin: 0 auto; padding: 1mm; }
                .employee { font-weight: 700; overflow-wrap: anywhere; }
                .login { margin-top: 2px; font-size: 10px; overflow-wrap: anywhere; }
                .period { margin-top: 2px; font-size: 10px; overflow-wrap: anywhere; }
                .rule { border: 0; border-top: 1px dashed #502818; margin: 7px 0; }
                .payment { margin: 7px 0; overflow-wrap: anywhere; }
                .payment-name { font-weight: 600; }
                .payment-total { margin-top: 2px; }
                .grand-total { display: flex; justify-content: space-between; gap: 5px; font-size: 13px; font-weight: 700; }
            </style>
        </head>
        <body>
            <main class="receipt">
                <div class="employee">Funcionário: ${escapeHtml(funcionario || '—')}</div>
                ${loginFuncionario ? `<div class="login">Login: ${escapeHtml(loginFuncionario)}</div>` : ''}
                <div class="period">Abertura: ${escapeHtml(dataHoraCaixa(caixa.data_abertura))}</div>
                <div class="period">Fechamento: ${escapeHtml(dataHoraCaixa(dataHoraFechamento))}</div>
                <hr class="rule">
                ${blocosPagamento}
                <hr class="rule">
                <div class="grand-total">
                    <span>Total de vendas</span>
                    <span>${moedaCaixa(totalVendasCentavos / 100)}</span>
                </div>
            </main>
            <script>window.onload=()=>{window.focus();window.print();};</script>
        </body>
        </html>`);
    janela.document.close();
}

async function abrirCaixa(evento) {
    evento.preventDefault();
    const botao = document.getElementById('btnAbrirCaixa');
    botao.disabled = true;
    try {
        await api.post('/api/caixa/abertura', {
            valor_inicial: Number(document.getElementById('valorInicial').value)
        });
        document.getElementById('formAbertura').reset();
        exibirMensagemCaixa('Caixa aberto com sucesso.', 'success');
        await carregarPaginaCaixa();
    } catch (erro) {
        exibirMensagemCaixa(`Não foi possível abrir o caixa: ${erro.message}`, 'error');
    } finally {
        botao.disabled = false;
    }
}

async function registrarMovimentacao(evento) {
    evento.preventDefault();
    if (!caixaAtual) return;
    const botao = document.getElementById('btnRegistrarMovimentacao');
    const dados = Object.fromEntries(new FormData(evento.currentTarget).entries());
    botao.disabled = true;
    try {
        await api.post(`/api/caixa/${caixaAtual.id_caixa}/movimentacoes`, dados);
        evento.currentTarget.reset();
        atualizarCamposMovimentacao();
        exibirMensagemCaixa('Movimentação registrada com sucesso.', 'success');
        await carregarPaginaCaixa();
    } catch (erro) {
        exibirMensagemCaixa(`Não foi possível registrar a movimentação: ${erro.message}`, 'error');
    } finally {
        botao.disabled = false;
    }
}

function atualizarCamposMovimentacao() {
    const tipo = document.getElementById('tipoMovimentacao').value;
    const campoCategoria = document.getElementById('campoCategoria');
    const categoria = document.getElementById('categoriaMovimentacao');
    campoCategoria.hidden = tipo !== 'DESPESA';
    categoria.required = tipo === 'DESPESA';
    document.getElementById('rotuloDescricao').firstChild.textContent =
        tipo === 'SANGRIA' ? 'Motivo da retirada' : 'Descrição ou justificativa';
}

function fecharModal(id) {
    document.getElementById(id).classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
    if (!auth.verificarAutenticacao()) return;
    document.getElementById('formAbertura').addEventListener('submit', abrirCaixa);
    document.getElementById('formMovimentacao').addEventListener('submit', registrarMovimentacao);
    document.getElementById('tipoMovimentacao').addEventListener('change', atualizarCamposMovimentacao);
    document.getElementById('filtrosMovimentacoes').addEventListener('submit', evento => {
        evento.preventDefault();
        carregarMovimentacoes();
    });
    document.getElementById('formFechamento').addEventListener('submit', prepararRevisaoFechamento);
    document.getElementById('confirmarFechamento').addEventListener('click', confirmarFechamentoCaixa);
    document.getElementById('imprimirRelatorioRevisao').addEventListener('click', imprimirRelatorioFechamentoPendente);
    document.getElementById('fecharConferencia').addEventListener('click', () => fecharModal('modalConferencia'));
    document.getElementById('voltarConferencia').addEventListener('click', () => fecharModal('modalConferencia'));
    document.getElementById('fecharDetalhes').addEventListener('click', () => fecharModal('modalDetalhes'));
    document.getElementById('fecharDetalhesBotao').addEventListener('click', () => fecharModal('modalDetalhes'));
    document.getElementById('imprimirResumo').addEventListener('click', imprimirDetalhesCaixa);
    document.getElementById('atualizarHistorico').addEventListener('click', atualizarHistorico);
    document.getElementById('tabelaHistorico').addEventListener('click', evento => {
        const botao = evento.target.closest('[data-detalhes-id]');
        if (botao) abrirDetalhesCaixa(botao.dataset.detalhesId);
    });
    carregarPaginaCaixa();
    window.setInterval(() => {
        if (document.visibilityState === 'visible') carregarPaginaCaixa();
    }, 15000);
});
