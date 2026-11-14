// ==========================================================================
// PAINEL DE CONTROLE / DASHBOARD INTERATIVO
// ==========================================================================

let logotipoAtual = null;
let logotipoNovo = null;
let logotipoRemovido = false;

function mostrarMensagemConfiguracao(texto, tipo = 'sucesso') {
    const mensagem = document.getElementById('mensagemConfiguracao');
    if (!mensagem) return;
    mensagem.textContent = texto;
    mensagem.className = `settings-message settings-message-${tipo}`;
    mensagem.hidden = false;
}

function preencherConfiguracao(configuracao) {
    const form = document.getElementById('formConfiguracaoEstabelecimento');
    if (!form) return;

    for (const [campo, valor] of Object.entries(configuracao)) {
        const controle = form.elements.namedItem(campo);
        if (!controle || controle.type === 'file') continue;
        if (controle.type === 'checkbox') {
            controle.checked = valor === true || Number(valor) === 1;
        } else {
            controle.value = valor ?? '';
        }
    }

    logotipoAtual = configuracao.logotipo || null;
    logotipoNovo = null;
    logotipoRemovido = false;
    atualizarPreviaLogotipo(logotipoAtual);
}

function atualizarPreviaLogotipo(src) {
    const imagem = document.getElementById('previaLogotipo');
    const remover = document.getElementById('removerLogotipo');
    if (!imagem || !remover) return;
    imagem.hidden = !src;
    imagem.src = src || '';
    remover.hidden = !src;
}

function lerArquivoComoDataUrl(arquivo) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result);
        leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo de logotipo.'));
        leitor.readAsDataURL(arquivo);
    });
}

function obterConfiguracaoDoFormulario() {
    const form = document.getElementById('formConfiguracaoEstabelecimento');
    const configuracao = {};
    for (const controle of form.elements) {
        if (!controle.name || controle.type === 'file') continue;
        if (controle.type === 'checkbox') {
            configuracao[controle.name] = controle.checked;
        } else {
            configuracao[controle.name] = controle.value.trim();
        }
    }
    configuracao.logotipo = logotipoNovo || (logotipoRemovido ? '' : logotipoAtual || '');
    return configuracao;
}

function obterVendaDeDemonstracao() {
    return {
        id_venda: 'Prévia',
        data_hora: new Date().toISOString(),
        operador: 'Operador de demonstração',
        itens: [{ nome: 'Produto de exemplo', quantidade: 2, preco_unitario: 19.9, subtotal: 39.8 }],
        valor_subtotal: 39.8,
        desconto: 0,
        valor_total: 39.8,
        valor_recebido: 39.8,
        troco: 0,
        pagamentos: [{ forma_pagamento: 'Pix', valor: 39.8 }]
    };
}

function iniciarConfiguracaoEstabelecimento(usuario) {
    const form = document.getElementById('formConfiguracaoEstabelecimento');
    if (!form) return;

    const podeEditar = [1, 2].includes(Number(usuario?.id_tipo_usuario));
    const controles = form.querySelectorAll('input, select, button');
    controles.forEach(controle => { controle.disabled = true; });

    api.get('/api/configuracoes/estabelecimento')
        .then(configuracao => {
            preencherConfiguracao(configuracao);
            controles.forEach(controle => {
                controle.disabled = ['visualizarComprovante', 'imprimirTeste'].includes(controle.id)
                    ? false
                    : !podeEditar;
            });
            if (!podeEditar) {
                mostrarMensagemConfiguracao('Somente administradores e gerentes podem alterar estas configurações.', 'erro');
            }
        })
        .catch(erro => mostrarMensagemConfiguracao(`Não foi possível carregar as configurações: ${erro.message}`, 'erro'));

    form.onsubmit = async evento => {
        evento.preventDefault();
        const botaoSalvar = document.getElementById('salvarConfiguracao');
        botaoSalvar.disabled = true;
        try {
            const resposta = await api.put('/api/configuracoes/estabelecimento', obterConfiguracaoDoFormulario());
            preencherConfiguracao(resposta.configuracao);
            mostrarMensagemConfiguracao(resposta.mensagem);
        } catch (erro) {
            mostrarMensagemConfiguracao(`Não foi possível salvar: ${erro.message}`, 'erro');
        } finally {
            botaoSalvar.disabled = !podeEditar;
        }
    };

    const arquivoLogotipo = document.getElementById('arquivo_logotipo');
    arquivoLogotipo.onchange = async () => {
        const arquivo = arquivoLogotipo.files[0];
        if (!arquivo) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type)) {
            arquivoLogotipo.value = '';
            mostrarMensagemConfiguracao('O logotipo deve estar no formato JPG, PNG ou WEBP.', 'erro');
            return;
        }
        if (arquivo.size > 5 * 1024 * 1024) {
            arquivoLogotipo.value = '';
            mostrarMensagemConfiguracao('O logotipo deve ter no máximo 5 MB.', 'erro');
            return;
        }
        try {
            logotipoNovo = await lerArquivoComoDataUrl(arquivo);
            logotipoRemovido = false;
            atualizarPreviaLogotipo(logotipoNovo);
        } catch (erro) {
            mostrarMensagemConfiguracao(erro.message, 'erro');
        }
    };

    document.getElementById('removerLogotipo').onclick = () => {
        logotipoAtual = null;
        logotipoNovo = null;
        logotipoRemovido = true;
        arquivoLogotipo.value = '';
        atualizarPreviaLogotipo(null);
    };

    document.getElementById('visualizarComprovante').onclick = () => {
        const abriu = window.comprovante.abrir(obterConfiguracaoDoFormulario(), obterVendaDeDemonstracao(), 'previa');
        if (!abriu) mostrarMensagemConfiguracao('Permita a abertura de janelas para visualizar o comprovante.', 'erro');
    };

    document.getElementById('imprimirTeste').onclick = () => {
        const abriu = window.comprovante.abrir(obterConfiguracaoDoFormulario(), obterVendaDeDemonstracao(), 'teste');
        if (!abriu) mostrarMensagemConfiguracao('Permita a abertura de janelas para imprimir o teste.', 'erro');
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verifica autenticação e atualiza mensagem de boas-vindas
    const usuario = auth.verificarAutenticacao();
    if (usuario) {
        const welcomeTitle = document.querySelector('.welcome-section h1');
        if (welcomeTitle) {
            welcomeTitle.textContent = `Bem-vindo, ${usuario.nome || usuario.login}!`;
        }
    }
    iniciarConfiguracaoEstabelecimento(usuario);

    // 2. Vincula ações aos botões dos cards
    const cards = document.querySelectorAll('.card-item');
    cards.forEach(card => {
        const title = card.querySelector('h5')?.textContent?.toLowerCase() || '';
        const btn = card.querySelector('.btn-card');
        if (!btn) return;

        if (title.includes('estoque')) {
            btn.onclick = () => window.location.href = 'controleEstoque.html';
        } else if (title.includes('usuário')) {
            btn.onclick = () => window.location.href = 'controleUsuarios.html';
        } else if (title.includes('produto')) {
            btn.onclick = () => window.location.href = 'cadastroProdutos.html';
        } else if (title.includes('pdv')) {
            btn.onclick = () => window.location.href = 'pdv.html';
        } else if (title.includes('caixa')) {
            btn.onclick = () => alert('Módulo de Abertura/Fechamento de Caixa em desenvolvimento para a próxima fase.');
        }
    });

    // 3. Atualiza contadores dinâmicos nos cartões
    try {
        const produtos = await api.get('/api/produtos');

        const cardEstoqueP = document.querySelector('.card-item:nth-child(3) p');
        if (cardEstoqueP) {
            const estoqueBaixo = produtos.filter(p => (parseFloat(p.estoque_atual) <= parseFloat(p.estoque_minimo))).length;
            cardEstoqueP.innerHTML = `Total de <strong>${produtos.length}</strong> produtos cadastrados. <br><span style="color:#502818; font-weight:600;">${estoqueBaixo} produto(s) com estoque baixo!</span>`;
        }

        if ([1, 2].includes(Number(usuario?.id_tipo_usuario))) {
            const usuarios = await api.get('/api/usuarios');
            const cardUsuariosP = document.querySelector('.card-item:nth-child(4) p');
            if (cardUsuariosP) {
                const ativos = usuarios.filter(u => u.status === 'ATIVO').length;
                cardUsuariosP.innerHTML = `Total de <strong>${usuarios.length}</strong> usuários (${ativos} ativos no sistema).`;
            }
        }
    } catch (e) {
        console.warn('Dashboard stats:', e.message);
    }
});
