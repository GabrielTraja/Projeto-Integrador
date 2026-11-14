# ☕ CoffeeFlow - Sistema de Gestão e PDV para Cafeteria

Sistema completo de gestão comercial e Ponto de Venda (PDV) desenvolvido especialmente para cafeterias e bistrôs. O sistema oferece frente de caixa ágil com catálogo visual de itens, controle de estoque com alertas de reposição, cadastro de produtos com imagens, gerenciamento de equipe e painel de controle administrativo.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** HTML5 semântico, CSS3 (Design responsivo e paleta temática de cafeteria), JavaScript Moderno (ES6+)
- **Backend:** Node.js, Express
- **Banco de Dados:** MySQL
- **Comunicação:** API REST assíncrona (Fetch API)

---

## 🚀 Como Instalar e Rodar Localmente

### 1. Pré-requisitos
- **Node.js** (v18 ou superior)
- **MySQL Server** em execução

### 2. Configurar Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto (ou dentro da pasta `backend/`) com as configurações do seu banco MySQL:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=sua_senha_mysql
DB_NAME=pdv
PORT=3000
```

> **Nota:** As tabelas, categorias e produtos iniciais de cafeteria são criados automaticamente na primeira inicialização do servidor.
> O Caixa não é aberto automaticamente: abra uma sessão na página **Caixa** antes de registrar vendas no PDV.

### Controle de Caixa

A página Caixa registra abertura, suprimentos, sangrias, despesas em dinheiro e conferência de fechamento por forma de pagamento. As vendas do PDV são vinculadas à sessão aberta; sem sessão, a venda é recusada. PIX e cartões são exibidos no resumo financeiro, mas não compõem o saldo físico da gaveta.

### 3. Instalar Dependências
No terminal, execute:
```bash
npm install
```
*(ou dentro da pasta `backend`: `cd backend && npm install`)*

### 4. Iniciar o Servidor
Na raiz do projeto:
```bash
npm start
```
*(Para modo de desenvolvimento com autoreload: `npm run dev`)*

### 5. Acessar o Sistema
Abra o navegador no endereço:
👉 **http://localhost:3000**

---

## 🔑 Credenciais Padrão de Primeiro Acesso

O sistema configura automaticamente um administrador inicial:

- **Usuário:** `admin`
- **Senha:** `admin123`
