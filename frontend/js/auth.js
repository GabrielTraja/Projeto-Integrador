// ==========================================================================
// GERENCIAMENTO DE AUTENTICAÇÃO E SESSÃO
// ==========================================================================

const auth = {
    obterUsuario() {
        const dados = localStorage.getItem('pdv_usuario');
        return dados ? JSON.parse(dados) : null;
    },

    salvarUsuario(usuario, token) {
        localStorage.setItem('pdv_usuario', JSON.stringify(usuario));
        localStorage.setItem('pdv_token', token);
    },

    limparSessao() {
        localStorage.removeItem('pdv_usuario');
        localStorage.removeItem('pdv_token');
    },

    logout() {
        this.limparSessao();
        window.location.href = 'login.html';
    },

    verificarAutenticacao() {
        const usuario = this.obterUsuario();
        const paginaAtual = window.location.pathname.toLowerCase();
        const ehPaginaPublica = paginaAtual.endsWith('login.html') || 
                                paginaAtual === '/' ||
                                paginaAtual.endsWith('index.html');

        if ((!usuario || !localStorage.getItem('pdv_token')) && !ehPaginaPublica) {
            this.limparSessao();
            window.location.href = 'login.html';
            return null;
        }

        return usuario;
    },

    atualizarCabecalho() {
        const usuario = this.obterUsuario();
        if (!usuario) return;

        const userNameElements = document.querySelectorAll('.user-name');
        userNameElements.forEach(el => {
            el.textContent = usuario.nome || usuario.login;
        });

        // Configura o botão de logout
        const logoutBtns = document.querySelectorAll('.btn-logout');
        logoutBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                if (confirm('Deseja realmente sair do sistema?')) {
                    auth.logout();
                }
            };
        });
    },

    inicializarSidebarToggle() {
        // Aplica o estado de recolhido salvo no localStorage
        const sidebarRecolhida = localStorage.getItem('sidebar_collapsed') === 'true';
        if (sidebarRecolhida) {
            document.body.classList.add('sidebar-collapsed');
        } else {
            document.body.classList.remove('sidebar-collapsed');
        }

        const btnToggle = document.getElementById('btnToggleSidebar');
        if (btnToggle) {
            btnToggle.onclick = () => {
                const recolhida = document.body.classList.toggle('sidebar-collapsed');
                localStorage.setItem('sidebar_collapsed', recolhida ? 'true' : 'false');
            };
        }
    }
};

// ==========================================================================
// ALERTA DE VALIDADE DE PRODUTOS PERECÍVEIS
// ==========================================================================

const validadeProdutos = {
    DIAS_ALERTA: 3,
    CHAVE_DISPENSA: 'pdv_alerta_validade_dispensado',

    // Diferença em dias entre hoje (data local) e a data ISO (AAAA-MM-DD)
    diasAte(dataIso) {
        const [ano, mes, dia] = String(dataIso).split('-').map(Number);
        const alvo = new Date(ano, mes - 1, dia);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        return Math.round((alvo - hoje) / 86400000);
    },

    formatarData(dataIso) {
        const [ano, mes, dia] = String(dataIso).split('-');
        return ano && mes && dia ? `${dia}/${mes}/${ano}` : '';
    },

    descreverPrazo(dias) {
        if (dias < 0) return `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`;
        if (dias === 0) return 'Vence hoje';
        if (dias === 1) return 'Vence amanhã';
        return `Vence em ${dias} dias`;
    },

    assinatura(produtos) {
        const agora = new Date();
        const hoje = `${agora.getFullYear()}-${agora.getMonth() + 1}-${agora.getDate()}`;
        return `${hoje}|${produtos.map(p => `${p.id_produto}:${p.data_validade}`).join(',')}`;
    },

    foiDispensado(assinatura) {
        try {
            return sessionStorage.getItem(this.CHAVE_DISPENSA) === assinatura;
        } catch {
            return false;
        }
    },

    dispensar(assinatura) {
        try {
            sessionStorage.setItem(this.CHAVE_DISPENSA, assinatura);
        } catch {
            // Sem armazenamento disponível: o alerta apenas voltará a aparecer na próxima tela
        }
    },

    async verificar() {
        if (typeof api === 'undefined' || !localStorage.getItem('pdv_token')) return;
        if (document.querySelector('.alerta-validade-overlay')) return;

        let resposta;
        try {
            resposta = await api.get('/api/produtos/alertas/validade');
        } catch (erro) {
            console.warn('Não foi possível verificar a validade dos produtos:', erro.message);
            return;
        }

        const produtos = Array.isArray(resposta?.produtos) ? resposta.produtos : [];
        if (produtos.length === 0) return;

        const assinatura = this.assinatura(produtos);
        if (this.foiDispensado(assinatura)) return;

        this.exibirPopup(produtos, assinatura, resposta.dias || this.DIAS_ALERTA);
    },

    exibirPopup(produtos, assinatura, dias) {
        const vencidos = produtos.filter(p => this.diasAte(p.data_validade) < 0).length;
        const itens = produtos.map(produto => {
            const prazo = this.diasAte(produto.data_validade);
            const classe = prazo < 0 ? 'validade-vencido' : 'validade-alerta';
            const estoque = `${Number(produto.estoque_atual) || 0} ${produto.unidade_medida || 'UN'}`;
            return `
                <li>
                    <div class="alerta-validade-produto">
                        <strong>${escapeHtml(produto.nome)}</strong>
                        <span>Validade: ${escapeHtml(this.formatarData(produto.data_validade))} · Estoque: ${escapeHtml(estoque)}</span>
                    </div>
                    <span class="validade-tag ${classe}">${escapeHtml(this.descreverPrazo(prazo))}</span>
                </li>
            `;
        }).join('');

        const resumo = vencidos > 0
            ? `${produtos.length} produto(s) vencido(s) ou vencendo em até ${dias} dias (${vencidos} já vencido(s)).`
            : `${produtos.length} produto(s) vencendo em até ${dias} dias.`;

        const overlay = document.createElement('div');
        overlay.className = 'alerta-validade-overlay';
        overlay.innerHTML = `
            <div class="alerta-validade-modal" role="alertdialog" aria-modal="true" aria-labelledby="alertaValidadeTitulo" aria-describedby="alertaValidadeResumo">
                <div class="alerta-validade-header">
                    <div>
                        <h2 id="alertaValidadeTitulo">⚠️ Produtos próximos do vencimento</h2>
                        <p id="alertaValidadeResumo">${escapeHtml(resumo)}</p>
                    </div>
                    <button type="button" class="alerta-validade-fechar" aria-label="Fechar alerta" title="Fechar">&times;</button>
                </div>
                <ul class="alerta-validade-lista">${itens}</ul>
                <div class="alerta-validade-acoes">
                    <a href="controleEstoque.html">Ver estoque</a>
                    <button type="button" class="alerta-validade-continuar">Continuar</button>
                </div>
            </div>
        `;

        const fechar = () => {
            this.dispensar(assinatura);
            overlay.remove();
            document.removeEventListener('keydown', aoPressionarTecla);
        };
        const aoPressionarTecla = (evento) => {
            if (evento.key === 'Escape') fechar();
        };

        overlay.querySelector('.alerta-validade-fechar').onclick = fechar;
        overlay.querySelector('.alerta-validade-continuar').onclick = fechar;
        overlay.querySelector('.alerta-validade-acoes a').onclick = () => this.dispensar(assinatura);
        overlay.addEventListener('click', (evento) => {
            if (evento.target === overlay) fechar();
        });
        document.addEventListener('keydown', aoPressionarTecla);

        document.body.appendChild(overlay);
        overlay.querySelector('.alerta-validade-continuar').focus();
    }
};

// Executa ao carregar as telas protegidas
document.addEventListener('DOMContentLoaded', () => {
    auth.atualizarCabecalho();
    auth.inicializarSidebarToggle();

    const paginaAtual = window.location.pathname.toLowerCase();
    const ehPaginaPublica = paginaAtual.endsWith('login.html') ||
                            paginaAtual === '/' ||
                            paginaAtual.endsWith('index.html');
    if (!ehPaginaPublica) {
        validadeProdutos.verificar();
    }
});
