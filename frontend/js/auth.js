// ==========================================================================
// GERENCIAMENTO DE AUTENTICAÇÃO E SESSÃO
// ==========================================================================

const auth = {
    obterUsuario() {
        const dados = localStorage.getItem('pdv_usuario');
        return dados ? JSON.parse(dados) : null;
    },

    salvarUsuario(usuario) {
        localStorage.setItem('pdv_usuario', JSON.stringify(usuario));
    },

    limparSessao() {
        localStorage.removeItem('pdv_usuario');
    },

    logout() {
        this.limparSessao();
        window.location.href = 'login.html';
    },

    verificarAutenticacao() {
        const usuario = this.obterUsuario();
        const paginaAtual = window.location.pathname.toLowerCase();
        const ehPaginaPublica = paginaAtual.endsWith('login.html') || 
                                paginaAtual.endsWith('cadastrousuario.html') ||
                                paginaAtual === '/' ||
                                paginaAtual.endsWith('index.html');

        if (!usuario && !ehPaginaPublica) {
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
    }
};

// Executa ao carregar as telas protegidas
document.addEventListener('DOMContentLoaded', () => {
    auth.atualizarCabecalho();
});

