// ==========================================================================
// CRUD DE USUÁRIOS - REAPROVEITAMENTO E ADAPTAÇÃO DO INDEX ANTERIOR
// ==========================================================================

let listaItens = [];
let tiposUsuarios = [];

// 1. Carrega dados da API e renderiza a tabela
async function carregarDados() {
    try {
        const busca = document.getElementById('buscarUsuario')?.value || '';
        const tipo = document.getElementById('tipoUsuario')?.value || '';

        let url = '/api/usuarios';
        const params = new URLSearchParams();
        if (busca) params.append('busca', busca);
        if (tipo) params.append('tipo', tipo);
        if (params.toString()) url += `?${params.toString()}`;

        listaItens = await api.get(url);
        mostrar();
    } catch (erro) {
        console.error('Erro ao carregar usuários:', erro);
        const tbody = document.querySelector('.stock-table tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #ef4444; padding: 20px;">Erro ao carregar usuários: ${escapeHtml(erro.message)}</td></tr>`;
        }
    }
}

// 2. Função mostrar(): Renderiza a lista de usuários na tabela (Lógica adaptada do index.html)
function mostrar() {
    const tbody = document.querySelector('.stock-table tbody');
    if (!tbody) return;
    const podeGerenciar = Number(auth.obterUsuario()?.id_tipo_usuario) === 1;

    if (!listaItens || listaItens.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color: #64748b;">Nenhum usuário encontrado.</td></tr>`;
        return;
    }

    let html = '';
    listaItens.forEach(item => {
        const ehAtivo = item.status === 'ATIVO';
        const iniciais = (item.nome || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

        // Classe de perfil
        let roleClass = 'role-caixa';
        const tipo = (item.tipo_nome || '').toLowerCase();
        if (tipo.includes('admin')) roleClass = 'role-admin';
        else if (tipo.includes('gerente')) roleClass = 'role-gerente';
        else if (tipo.includes('estoque')) roleClass = 'role-estoque';

        html += `
            <tr class="${!ehAtivo ? 'low-stock-row' : ''}">
                <td class="img-cell">
                    <div class="user-img">${escapeHtml(iniciais)}</div>
                </td>
                <td class="product-name">
                    ${escapeHtml(item.nome)}
                    <br><span style="font-size: 0.8rem; color: #64748b; font-weight: normal;">Login: ${escapeHtml(item.login)}</span>
                </td>
                <td>${item.email ? escapeHtml(item.email) : '<span style="color:#94a3b8">Não informado</span>'}</td>
                <td><span class="user-role ${roleClass}">${escapeHtml(item.tipo_nome || 'Operador')}</span></td>
                <td>
                    <span class="status ${ehAtivo ? 'status-ok' : 'status-warning'}">
                        ${escapeHtml(item.status)}
                    </span>
                </td>
                <td class="actions-cell">
                    ${podeGerenciar ? `
                        <button type="button" class="btn-action edit" title="Editar Usuário" onclick="editar(${item.id_usuario})">✏️</button>
                        <button type="button" class="btn-action delete" title="Excluir Usuário" onclick="deletar(${item.id_usuario})">🗑️</button>
                    ` : ''}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// 3. Função salvarDados(): Cadastra novo usuário (usada em cadastroUsuario.html)
async function salvarDados(event) {
    if (event) event.preventDefault();

    const nome = document.getElementById('nome')?.value?.trim();
    const cpf = document.getElementById('cpf')?.value?.trim();
    const login = document.getElementById('usuario')?.value?.trim();
    const email = document.getElementById('email')?.value?.trim();
    const telefone = document.getElementById('telefone')?.value?.trim();
    const id_tipo_usuario = document.getElementById('id_tipo_usuario')?.value || 3;
    const senha = document.getElementById('senha')?.value;
    const confirmarSenha = document.getElementById('confirmarSenha')?.value;

    if (!nome || !login || !senha) {
        alert('Nome, Usuário (Login) e Senha são campos obrigatórios!');
        return;
    }

    if (senha !== confirmarSenha) {
        alert('As senhas digitadas não conferem. Verifique e tente novamente.');
        return;
    }

    const payload = {
        nome,
        cpf: cpf || null,
        login,
        email: email || null,
        telefone: telefone || null,
        senha,
        status: 'ATIVO',
        id_tipo_usuario: parseInt(id_tipo_usuario, 10)
    };

    try {
        await api.post('/api/usuarios', payload);
        alert('Usuário cadastrado com sucesso!');
        
        // Se já houver um usuário autenticado, volta para controleUsuarios, senão vai para login
        const usuarioLogado = auth.obterUsuario();
        if (usuarioLogado) {
            window.location.href = 'controleUsuarios.html';
        } else {
            window.location.href = 'login.html';
        }
    } catch (erro) {
        alert(`Erro ao cadastrar usuário: ${erro.message}`);
    }
}

// 4. Função editar(id): Abre o modal de edição rápida do usuário (Lógica adaptada do index.html)
function editar(id) {
    const usuario = listaItens.find(u => u.id_usuario === id);
    if (!usuario) return;

    let modal = document.getElementById('modalEditarUsuario');
    if (!modal) {
        // Cria dinamicamente o modal se não existir no HTML
        const modalDiv = document.createElement('div');
        modalDiv.id = 'modalEditarUsuario';
        modalDiv.className = 'modal-overlay';
        modalDiv.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Editar Usuário</h3>
                    <button class="btn-close-modal" onclick="fecharModal()">&times;</button>
                </div>
                <form id="formEditarUsuario" onsubmit="editarDados(${id}, event)">
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; color:#334155;">Nome Completo:</label>
                            <input type="text" id="editNome" class="form-control" required>
                        </div>
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; color:#334155;">Login de Acesso:</label>
                            <input type="text" id="editLogin" class="form-control" required>
                        </div>
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; color:#334155;">E-mail:</label>
                            <input type="email" id="editEmail" class="form-control">
                        </div>
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; color:#334155;">Telefone:</label>
                            <input type="text" id="editTelefone" class="form-control">
                        </div>
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; color:#334155;">Perfil de Acesso:</label>
                            <select id="editTipo" class="form-control" required>
                                <option value="1">Administrador</option>
                                <option value="2">Gerente</option>
                                <option value="3">Operador de Caixa</option>
                                <option value="4">Estoquista</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; color:#334155;">Status:</label>
                            <select id="editStatus" class="form-control">
                                <option value="ATIVO">Ativo</option>
                                <option value="INATIVO">Inativo</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; color:#334155;">Nova Senha (deixe em branco para manter a atual):</label>
                            <input type="password" id="editSenha" class="form-control" placeholder="••••••••">
                        </div>
                        <div style="display:flex; gap:10px; margin-top:15px;">
                            <button type="submit" class="btn-primary" style="flex:1; justify-content:center;">Salvar Alterações</button>
                            <button type="button" class="btn-cancel" onclick="fecharModal()">Cancelar</button>
                        </div>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modalDiv);
        modal = modalDiv;
    }

    // Preenche campos do modal com os dados atuais
    document.getElementById('editNome').value = usuario.nome || '';
    document.getElementById('editLogin').value = usuario.login || '';
    document.getElementById('editEmail').value = usuario.email || '';
    document.getElementById('editTelefone').value = usuario.telefone || '';
    document.getElementById('editTipo').value = usuario.id_tipo_usuario || 1;
    document.getElementById('editStatus').value = usuario.status || 'ATIVO';
    document.getElementById('editSenha').value = '';

    const form = document.getElementById('formEditarUsuario');
    form.onsubmit = (e) => editarDados(id, e);

    modal.classList.add('active');
}

function fecharModal() {
    const modal = document.getElementById('modalEditarUsuario');
    if (modal) modal.classList.remove('active');
}

// 5. Função editarDados(id): Atualiza dados do usuário via PUT (Lógica adaptada do index.html)
async function editarDados(id, event) {
    if (event) event.preventDefault();

    const nome = document.getElementById('editNome')?.value?.trim();
    const login = document.getElementById('editLogin')?.value?.trim();
    const email = document.getElementById('editEmail')?.value?.trim();
    const telefone = document.getElementById('editTelefone')?.value?.trim();
    const id_tipo_usuario = document.getElementById('editTipo')?.value;
    const status = document.getElementById('editStatus')?.value;
    const senha = document.getElementById('editSenha')?.value;

    if (!nome || !login) {
        alert('Nome e Login são obrigatórios!');
        return;
    }

    const payload = {
        nome,
        login,
        email: email || null,
        telefone: telefone || null,
        id_tipo_usuario: parseInt(id_tipo_usuario, 10),
        status: status || 'ATIVO'
    };

    if (senha && senha.trim()) {
        payload.senha = senha.trim();
    }

    try {
        await api.put(`/api/usuarios/${id}`, payload);
        alert('Usuário atualizado com sucesso!');
        fecharModal();
        await carregarDados(); // Recarrega e chama mostrar()
    } catch (erro) {
        alert(`Erro ao atualizar usuário: ${erro.message}`);
    }
}

// 6. Função deletar(id): Deleta usuário com confirmação (Lógica adaptada do index.html)
async function deletar(id) {
    const usuarioLogado = auth.obterUsuario();
    if (usuarioLogado && usuarioLogado.id_usuario === id) {
        alert('Você não pode excluir o seu próprio usuário logado!');
        return;
    }

    const usuario = listaItens.find(u => u.id_usuario === id);
    const nome = usuario ? usuario.nome : 'este usuário';

    if (!confirm(`Tem certeza que deseja excluir o usuário "${nome}"?`)) {
        return;
    }

    try {
        await api.delete(`/api/usuarios/${id}`);
        // Atualiza a lista filtrando o ID removido
        listaItens = listaItens.filter(u => u.id_usuario !== id);
        mostrar();
    } catch (erro) {
        alert(`Erro ao deletar usuário: ${erro.message}`);
    }
}

// Inicializações de tela
document.addEventListener('DOMContentLoaded', async () => {
    // Se estiver na tela de listagem de usuários
    if (document.querySelector('.stock-table') && window.location.pathname.includes('controleUsuarios')) {
        await carregarDados();

        const searchForm = document.querySelector('.search-form');
        if (searchForm) {
            searchForm.onsubmit = (e) => {
                e.preventDefault();
                carregarDados();
            };
        }

        const selectTipo = document.getElementById('tipoUsuario');
        if (selectTipo) {
            selectTipo.onchange = () => carregarDados();
        }
    }

    // Se estiver na tela de cadastro de usuários
    const formCadastro = document.querySelector('#caixaLogin form');
    if (formCadastro && window.location.pathname.includes('cadastroUsuario')) {
        const usuarioLogado = auth.verificarAutenticacao();
        if (!usuarioLogado || Number(usuarioLogado.id_tipo_usuario) !== 1) {
            window.location.href = usuarioLogado ? 'controleUsuarios.html' : 'login.html';
            return;
        }
        formCadastro.onsubmit = salvarDados;
    }
});
