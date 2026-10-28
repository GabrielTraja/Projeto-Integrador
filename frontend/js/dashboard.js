// ==========================================================================
// PAINEL DE CONTROLE / DASHBOARD INTERATIVO
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verifica autenticação e atualiza mensagem de boas-vindas
    const usuario = auth.verificarAutenticacao();
    if (usuario) {
        const welcomeTitle = document.querySelector('.welcome-section h1');
        if (welcomeTitle) {
            welcomeTitle.textContent = `Bem-vindo, ${usuario.nome || usuario.login}!`;
        }
    }

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
        const usuarios = await api.get('/api/usuarios');

        const cardEstoqueP = document.querySelector('.card-item:nth-child(3) p');
        if (cardEstoqueP) {
            const estoqueBaixo = produtos.filter(p => (parseFloat(p.estoque_atual) <= parseFloat(p.estoque_minimo))).length;
            cardEstoqueP.innerHTML = `Total de <strong>${produtos.length}</strong> produtos cadastrados. <br><span style="color:#ef4444; font-weight:600;">${estoqueBaixo} produto(s) com estoque baixo!</span>`;
        }

        const cardUsuariosP = document.querySelector('.card-item:nth-child(4) p');
        if (cardUsuariosP) {
            const ativos = usuarios.filter(u => u.status === 'ATIVO').length;
            cardUsuariosP.innerHTML = `Total de <strong>${usuarios.length}</strong> usuários (${ativos} ativos no sistema).`;
        }
    } catch (e) {
        console.warn('Dashboard stats:', e.message);
    }
});

