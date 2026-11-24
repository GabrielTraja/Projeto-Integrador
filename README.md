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

---

## 🔐 Licenciamento (teste, planos e atualizações)

- **Período de teste:** 30 dias a partir da primeira execução em cada computador. Reinstalar não reinicia o teste, porque os marcadores ficam em `C:\ProgramData\NexGusto\licenca` e no banco.
- **Sem licença válida:** o sistema entra em **modo somente leitura**. Login, consultas e relatórios continuam funcionando; vendas, abertura de caixa e cadastros ficam bloqueados. Um caixa aberto antes do bloqueio pode concluir as vendas e ser fechado.
- **Licença:** é uma chave `NXG1.…` assinada digitalmente (Ed25519) e presa ao **código da máquina**, que aparece no botão **Licença** do cabeçalho.
- **Atualizações:** cada licença traz `atualizacoes_ate`. Se uma versão tiver sido lançada depois dessa data (`backend/src/versao.js`), ela fica em modo somente leitura até a renovação.

### Emitir licenças (somente o desenvolvedor)

```bash
# 1ª vez: cria o par de chaves em %USERPROFILE%\.nexagusto-licencas (FAÇA BACKUP da chave privada)
npm run licenca -- chaves

# Emitir para um cliente (o código da máquina é informado pelo cliente)
npm run licenca -- emitir --cliente "Cafeteria Aroma" --maquina ABCD-1234-EF56-7890 --plano ANUAL
npm run licenca -- emitir --cliente "Bistrô Sol" --maquina ... --plano VITALICIA --atualizacoes-dias 365
npm run licenca -- emitir --cliente "Café X" --maquina ... --plano MENSAL --dias 31

# Conferir uma chave
npm run licenca -- verificar NXG1....
```

Todas as licenças emitidas ficam registradas em `%USERPROFILE%\.nexagusto-licencas\licencas-emitidas.csv`.

> ⚠️ **Nunca** copie a `chave-privada.pem` para o repositório nem para o instalador. Se ela for perdida, não será mais possível emitir licenças. Se vazar, qualquer pessoa poderá gerar licenças válidas.

## 📦 Instalador para clientes (Windows)

```bash
npm run instalador
```

Requer o [Inno Setup 6](https://jrsoftware.org/isdl.php). O script baixa versões fixas do Node.js portátil, do MariaDB e do WinSW e gera `instalador/saida/NexGusto-PDV-Setup-<versão>.exe`. O instalador:

- instala o programa em `C:\Program Files\NexGusto PDV` e guarda os dados em `C:\ProgramData\NexGusto` (banco, fotos, backups, logs, configuração);
- cria dois serviços do Windows que iniciam com o computador: **NexGustoBanco** (MariaDB, porta 3307) e **NexGustoServidor** (porta 3000);
- gera senhas aleatórias para o banco e para as sessões;
- cria um atalho na área de trabalho e agenda um **backup diário às 12h30** (também disponível no menu Iniciar → *Fazer backup agora*);
- **em atualizações**, faz um backup antes de substituir os arquivos e mantém todos os dados;
- ao desinstalar, remove os serviços, mas **mantém os dados**.

### Publicar uma nova versão

1. Atualize `version` em `backend/package.json` e `lancamento` em `backend/src/versao.js`.
2. Execute `npm test` e `npm run instalador`.
3. Envie o novo instalador aos clientes. Ele atualiza a versão instalada sem apagar dados.
