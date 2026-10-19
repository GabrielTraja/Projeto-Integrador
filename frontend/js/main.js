// Exemplo de como buscar dados da API do backend
async function carregarUsuarios() {
    try {
        const resposta = await fetch('http://localhost:3000/api/usuarios');
        const usuarios = await resposta.json();
        console.log(usuarios);
    } catch (erro) {
        console.error('Erro ao buscar usuários:', erro);
    }
}

carregarUsuarios();