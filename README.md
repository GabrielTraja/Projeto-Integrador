# 🛒 PDV - Sistema de Ponto de Venda Integrado (Full Stack)

Sistema completo de Ponto de Venda (PDV) desenvolvido com arquitetura Full Stack limpa e desacoplada, utilizando **HTML5**, **CSS3**, **JavaScript (ES6+)**, **Node.js**, **Express** e **MySQL**.

---

## 📁 1. Estrutura de Pastas e Arquivos

```text
Projeto Integrador/
├── .env                          # Variáveis de ambiente da raiz
├── .gitignore                    # Arquivos ignorados pelo Git
├── package.json                  # Scripts raiz para execução facilitada
├── README.md                     # Documentação completa do projeto
│
├── backend/                      # Módulo do Servidor (Node.js & Express)
│   ├── .env                      # Configuração do banco para o backend
│   ├── .env.example              # Exemplo de configuração de ambiente
│   ├── package.json              # Dependências do backend (express, mysql2, cors, dotenv)
│   ├── server.js                 # Ponto de entrada do servidor e arquivos estáticos
│   └── src/
│       ├── config/
│       │   ├── database.js       # Pool de conexões MySQL2 com Promises
│       │   ├── initDb.js         # Inicializador automático de tabelas e seeds
│       │   └── pdv.sql           # Script SQL completo com DDL e DML
│       ├── controllers/
│       │   ├── authController.js       # Autenticação e login
│       │   ├── categoriaController.js  # Gerenciamento de categorias
│       │   ├── produtoController.js    # CRUD de produtos
│       │   └── usuarioController.js    # CRUD de usuários e perfis
│       ├── models/
│       │   ├── categoriaModel.js       # Queries de categorias
│       │   ├── produtoModel.js         # Queries e operações de produtos
│       │   └── usuarioModel.js         # Queries e operações de usuários
│       └── routes/
│           ├── authRoutes.js           # Rota /api/auth/login
│           ├── categoriaRoutes.js      # Rotas /api/categorias
│           ├── produtoRoutes.js        # Rotas /api/produtos
│           └── usuarioRoutes.js        # Rotas /api/usuarios
│
└── frontend/                     # Interface do Usuário (Cliente Web)
    ├── login.html                # Ponto de entrada principal (Login)
    ├── index.html                # Redirecionador automático para o Login
    ├── telaControle.html         # Painel principal / Dashboard com indicadores
    ├── cadastroProdutos.html     # Formulário de Cadastro e Edição de Produtos
    ├── controleEstoque.html      # Tabela e gerenciamento de Estoque/Produtos
    ├── cadastroUsuario.html      # Formulário de Cadastro de novos Usuários
    ├── controleUsuarios.html     # Tabela e gerenciamento de Usuários e Perfis
    │
    ├── css/
    │   ├── global.css            # Estilos globais (Reset, Variáveis, Header, Sidebar, Tabelas)
    │   ├── login.css             # Estilos específicos da tela de login e cadastro
    │   ├── telaControle.css      # Estilos dos cartões de atalho da dashboard
    │   ├── cadastroProduto.css   # Grid e campos do formulário de produtos
    │   ├── controleEstoque.css   # Ajustes finos da listagem de estoque
    │   └── controleUsuarios.css  # Ajustes de avatares e listagem de usuários
    │
    ├── js/
    │   ├── api.js                # Cliente HTTP unificado (GET, POST, PUT, DELETE)
    │   ├── auth.js               # Gerenciamento de sessão, autenticação e logout
    │   ├── dashboard.js          # Métricas em tempo real e atalhos da dashboard
    │   ├── produtos.js           # Lógica CRUD de produtos (adaptada do index original)
    │   └── usuarios.js           # Lógica CRUD de usuários (adaptada do index original)
    │
    └── icones/                   # Ícones das páginas e do menu lateral
```

---

## ⚙️ 2. Pré-requisitos

1. **Node.js** (versão 18 ou superior instalada).
2. **MySQL Server** (versão 8.0.16 ou superior em execução; a inicialização automática usa restrições `CHECK`).

---

## 🚀 3. Como Rodar o Projeto

### Passo 1: Configurar o arquivo `.env`
Crie ou edite um arquivo `.env` na raiz do projeto ou em `backend/.env`. Use apenas um local para evitar configurações divergentes:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=SuaSenhaDoMySQL
DB_NAME=pdv
PORT=3000
ADMIN_INITIAL_PASSWORD=troque-por-uma-senha-unica-com-12-caracteres-ou-mais
AUTH_TOKEN_SECRET=troque-por-um-segredo-aleatorio-com-32-caracteres-ou-mais
```

Substitua os dois últimos valores antes de iniciar. `ADMIN_INITIAL_PASSWORD` é usado quando a tabela de usuários está vazia e para substituir a credencial inicial conhecida em instalações antigas; escolha uma senha exclusiva com pelo menos 12 caracteres e não a compartilhe. `AUTH_TOKEN_SECRET` deve ter pelo menos 32 caracteres, permanecer igual entre reinicializações e não pode ser publicado. Gere um segredo aleatório, por exemplo, com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

O login inicial do administrador é `admin`; a senha é definida exclusivamente por `ADMIN_INITIAL_PASSWORD` no arquivo `.env` local. Não use `admin123` nem publique esse arquivo: essa senha é conhecida e permitiria acesso administrativo não autorizado. Se essa credencial já foi usada em uma instalação antiga, configure uma senha exclusiva com pelo menos 12 caracteres antes de iniciar o servidor; a inicialização substituirá a senha legada.

O usuário MySQL precisa poder criar o banco e tabelas e executar `CREATE`, `ALTER`, `SELECT`, `INSERT`, `UPDATE` e `DELETE`. Se a base já tiver usuários com e-mails duplicados, corrija-os antes de iniciar: a inicialização adiciona unicidade ao e-mail. Também corrija produtos existentes com preços ou estoque negativos antes de aplicar as restrições do esquema. Faça backup do banco antes de iniciar a migração.

Para desenvolver com o frontend em outra origem/porta, defina `window.PDV_API_BASE` antes de carregar `js/api.js`; por padrão, o projeto usa `http://localhost:3000` em desenvolvimento local e a própria origem quando servido pelo backend ou em produção. O cadastro de usuários requer uma sessão de Administrador.

### Passo 2: Instalar as dependências (caso necessário)
No terminal, dentro da pasta `backend`:
```bash
cd backend
npm install
```

### Passo 3: Iniciar a aplicação
Você pode iniciar diretamente da raiz do projeto ou da pasta `backend`:

**A partir da raiz do projeto:**
```bash
npm start
```
*ou modo desenvolvedor (com reload automático via nodemon):*
```bash
npm run dev
```

### Passo 4: Acessar a aplicação
Abra o navegador no endereço:
👉 **[http://localhost:3000](http://localhost:3000)**

> O servidor Express foi configurado para inicializar automaticamente o banco de dados e servir todos os arquivos estáticos do frontend. Ao acessar `http://localhost:3000`, a tela de **Login** será exibida como o ponto de entrada principal!

---

## 🔑 4. Primeiro acesso

Quando a tabela de usuários estiver vazia, a inicialização cria o usuário administrador `admin` e aplica o valor de `ADMIN_INITIAL_PASSWORD` como senha, armazenando somente o hash. A mesma variável também substitui a senha inicial conhecida (`admin123`) em instalações antigas. Não há senha padrão embutida no projeto; não configure nem reutilize `admin123`. Se a tabela já tiver outros usuários, nenhum administrador adicional é criado automaticamente; confirme que há uma conta ativa com perfil Administrador antes de usar as telas de gerenciamento.

O script SQL manual (`backend/src/config/pdv.sql`) cria a estrutura e os dados de referência, mas não cria uma conta administrativa. Para o provisionamento inicial automático, configure as variáveis acima e inicie a aplicação.

---

## 🛠️ 5. Funcionalidades Implementadas

### CRUD Completo de Usuários
- **Criar (Create):** Cadastro via `cadastroUsuario.html` com validação de senha e seleção de perfil.
- **Ler (Read):** Consulta em `controleUsuarios.html` com busca por nome/e-mail e filtro por perfil.
- **Atualizar (Update):** Modal interativo de edição rápida direto na tabela.
- **Deletar (Delete):** Exclusão com confirmação e validação para não excluir o próprio usuário logado.

### CRUD Completo de Produtos e Estoque
- **Criar (Create):** Cadastro completo em `cadastroProdutos.html` com código de barras, categoria, unidade, preços e estoque.
- **Ler (Read):** Listagem em `controleEstoque.html` com destaque visual automático em vermelho para produtos com estoque baixo (`estoque_atual <= estoque_minimo`).
- **Atualizar (Update):** Edição completa reaproveitando o formulário preenchido via parâmetro `?id=...`.
- **Deletar (Delete):** Exclusão com confirmação e atualização dinâmica da tabela.
- **Imagem do produto:** Upload JPG/JPEG, PNG ou WEBP (até 5 MB), pré-visualização e substituição/remoção. As imagens ficam em `backend/uploads`, com o caminho associado ao produto no campo `foto`.

### Ponto de Venda (PDV)
- Conclusão transacional de vendas com validação de carrinho, estoque e forma de pagamento.
- Pagamento em dinheiro com cálculo de troco; pagamentos combinados permitem parcelas em diferentes formas até cobrir o total.
- Após a conclusão, o operador pode imprimir um comprovante não fiscal conforme a largura e as opções cadastradas.
- Cada venda aprovada registra itens, baixa de estoque, pagamento e entrada financeira em `movimentacao_caixa`.
- O botão de confirmação bloqueia envios simultâneos; em caso de falha, a transação é revertida e a mensagem fica visível no terminal.
- Execute `npm --prefix backend test` para validar as regras de pagamento, troco, estoque e movimentação do caixa.

### Dados do estabelecimento e comprovantes
- A seção **Configurações** do painel permite cadastrar os dados do estabelecimento, logotipo e opções de impressão.
- A configuração é persistida em `configuracao_estabelecimento`, criada automaticamente por `initDb.js` ou pelo script `backend/src/config/pdv.sql`.
- Administradores e gerentes podem alterar as configurações; operadores do PDV podem carregar e utilizar os dados para imprimir comprovantes após vendas confirmadas.
- A pré-visualização e a impressão de teste usam dados demonstrativos identificados como prévia; comprovantes de venda usam exclusivamente os dados retornados pela venda concluída.

### Reaproveitamento de Código (CRUD do index original)
- As funções `salvarDados()`, `mostrar()`, `editar()`, `editarDados()` e `deletar()`, originalmente criadas no `index.html`, foram preservadas conceitualmente e integradas às rotas da API REST do backend via `fetch` assíncrono.
