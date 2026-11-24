#!/usr/bin/env node
// ==========================================================================
// GERADOR DE LICENÇAS NEXGUSTO — USO EXCLUSIVO DO DESENVOLVEDOR
// --------------------------------------------------------------------------
// NUNCA distribua este script junto com a chave privada nem a coloque no Git.
//
//   node ferramentas/licencas/gerar-licenca.js chaves
//   node ferramentas/licencas/gerar-licenca.js maquina
//   node ferramentas/licencas/gerar-licenca.js emitir --cliente "Cafeteria Aroma" \
//        --maquina ABCD-1234-EF56-7890 --plano ANUAL [--dias 365] [--expira 2027-12-31] \
//        [--atualizacoes-dias 365 | --atualizacoes-ate 2027-12-31 | --sem-limite-atualizacoes]
//   node ferramentas/licencas/gerar-licenca.js verificar <chave>
//
// Pasta das chaves: %USERPROFILE%\.nexagusto-licencas (ou NEXGUSTO_PASTA_CHAVES)
// ==========================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const raiz = path.resolve(__dirname, '../..');
const core = require(path.join(raiz, 'backend/src/license/licencaCore'));

const pastaChaves = process.env.NEXGUSTO_PASTA_CHAVES || path.join(os.homedir(), '.nexagusto-licencas');
const arquivoPrivada = path.join(pastaChaves, 'chave-privada.pem');
const arquivoPublica = path.join(pastaChaves, 'chave-publica.pem');
const arquivoRegistro = path.join(pastaChaves, 'licencas-emitidas.csv');
const arquivoChavePublicaSistema = path.join(raiz, 'backend/src/license/chavePublica.js');

const DIAS_PADRAO = { TESTE: 30, MENSAL: 31, ANUAL: 366 };

function sair(mensagem) {
    console.error(`\n✖ ${mensagem}\n`);
    process.exit(1);
}

function lerArgumentos(lista) {
    const opcoes = {};
    for (let i = 0; i < lista.length; i++) {
        const atual = lista[i];
        if (!atual.startsWith('--')) continue;
        const nome = atual.slice(2);
        const proximo = lista[i + 1];
        if (proximo === undefined || proximo.startsWith('--')) {
            opcoes[nome] = true;
        } else {
            opcoes[nome] = proximo;
            i++;
        }
    }
    return opcoes;
}

function escreverChavePublicaNoSistema(pem) {
    const conteudo = `// Chave PÚBLICA usada para conferir as licenças (gerada por ferramentas/licencas/gerar-licenca.js).
// Ela pode ser distribuída livremente: sem a chave privada não é possível emitir licenças.
module.exports = {
    CHAVE_PUBLICA: ${JSON.stringify(pem)}
};
`;
    fs.writeFileSync(arquivoChavePublicaSistema, conteudo, 'utf8');
}

function comandoChaves() {
    if (fs.existsSync(arquivoPrivada)) {
        sair(`Já existe uma chave privada em ${arquivoPrivada}.\n  Gerar outra invalidaria TODAS as licenças já emitidas. Operação cancelada.`);
    }
    fs.mkdirSync(pastaChaves, { recursive: true });
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    fs.writeFileSync(arquivoPrivada, privateKey, { encoding: 'utf8', mode: 0o600 });
    fs.writeFileSync(arquivoPublica, publicKey, 'utf8');
    escreverChavePublicaNoSistema(publicKey);
    console.log(`
✔ Par de chaves criado.
  Chave privada : ${arquivoPrivada}
  Chave pública : ${arquivoPublica}
  Sistema atualizado: backend/src/license/chavePublica.js

⚠ FAÇA BACKUP DA CHAVE PRIVADA (pen drive / cofre de senhas).
  Se ela for perdida, não será possível emitir novas licenças para esta versão.
  Se ela vazar, qualquer pessoa poderá gerar licenças válidas.
`);
}

function comandoMaquina() {
    const { codigoDestaMaquina } = require(path.join(raiz, 'backend/src/license/licencaService'));
    console.log(`Código desta máquina: ${codigoDestaMaquina()}`);
    process.exit(0);
}

function dataOuSair(valor, campo) {
    if (!core.dataValida(valor)) sair(`${campo} deve estar no formato AAAA-MM-DD (recebido: ${valor}).`);
    return valor;
}

function comandoEmitir(opcoes) {
    if (!fs.existsSync(arquivoPrivada)) sair('Chave privada não encontrada. Execute primeiro o comando "chaves".');
    const chavePrivada = fs.readFileSync(arquivoPrivada, 'utf8');

    const plano = String(opcoes.plano || '').toUpperCase();
    if (!core.PLANOS.includes(plano)) sair(`Informe --plano ${core.PLANOS.join(' | ')}.`);
    if (typeof opcoes.cliente !== 'string' || !opcoes.cliente.trim()) sair('Informe --cliente "Nome do cliente".');
    const maquina = String(opcoes.maquina || '').trim().toUpperCase();
    if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(maquina)) {
        sair('Informe --maquina com o código exibido na tela de licença do cliente (ex.: ABCD-1234-EF56-7890).');
    }

    const hoje = core.dataLocal();
    let expira = null;
    if (plano !== 'VITALICIA') {
        if (opcoes.expira) {
            expira = dataOuSair(opcoes.expira, '--expira');
        } else {
            const dias = opcoes.dias !== undefined ? Number(opcoes.dias) : DIAS_PADRAO[plano];
            if (!Number.isInteger(dias) || dias < 1) sair('--dias deve ser um número inteiro positivo.');
            expira = core.somarDias(hoje, dias - 1);
        }
        if (expira < hoje) sair('A data de expiração não pode estar no passado.');
    }

    let atualizacoesAte;
    if (opcoes['sem-limite-atualizacoes']) {
        atualizacoesAte = null;
    } else if (opcoes['atualizacoes-ate']) {
        atualizacoesAte = dataOuSair(opcoes['atualizacoes-ate'], '--atualizacoes-ate');
    } else if (opcoes['atualizacoes-dias']) {
        const dias = Number(opcoes['atualizacoes-dias']);
        if (!Number.isInteger(dias) || dias < 1) sair('--atualizacoes-dias deve ser um número inteiro positivo.');
        atualizacoesAte = core.somarDias(hoje, dias - 1);
    } else {
        // Padrão: planos com expiração recebem atualizações durante a vigência;
        // a vitalícia recebe 12 meses de atualizações.
        atualizacoesAte = expira || core.somarDias(hoje, 365);
    }

    const dados = {
        v: 1,
        id: crypto.randomBytes(6).toString('hex').toUpperCase(),
        cliente: opcoes.cliente.trim(),
        maquina,
        plano,
        emitida: hoje,
        expira,
        atualizacoes_ate: atualizacoesAte
    };
    const chave = core.assinarLicenca(dados, chavePrivada);

    const novoArquivo = !fs.existsSync(arquivoRegistro);
    const linha = [dados.id, hoje, dados.cliente.replace(/[";\r\n]/g, ' '), maquina, plano,
        expira || 'nunca', atualizacoesAte || 'sem limite', chave].map(v => `"${v}"`).join(';');
    fs.appendFileSync(arquivoRegistro,
        (novoArquivo ? 'id;emitida;cliente;maquina;plano;expira;atualizacoes_ate;chave\n' : '') + linha + '\n',
        'utf8');

    console.log(`
✔ Licença emitida (${dados.id})
  Cliente      : ${dados.cliente}
  Máquina      : ${maquina}
  Plano        : ${plano}
  Expira       : ${expira ? core.formatarData(expira) : 'nunca'}
  Atualizações : ${atualizacoesAte ? `até ${core.formatarData(atualizacoesAte)}` : 'sem limite'}
  Registro     : ${arquivoRegistro}

Envie a chave abaixo ao cliente (botão "Licença" no topo do sistema > colar > Ativar):

${chave}
`);
}

function comandoVerificar(chave) {
    const { CHAVE_PUBLICA } = require(path.join(raiz, 'backend/src/license/chavePublica'));
    const resultado = core.verificarLicenca(chave, CHAVE_PUBLICA, null);
    if (resultado.erro) sair(resultado.erro);
    console.log('✔ Chave autêntica:\n', resultado.dados);
}

const [comando, ...resto] = process.argv.slice(2);
switch (comando) {
    case 'chaves': comandoChaves(); break;
    case 'maquina': comandoMaquina(); break;
    case 'emitir': comandoEmitir(lerArgumentos(resto)); break;
    case 'verificar': comandoVerificar(resto.join('')); break;
    default:
        console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 15).join('\n').replace(/^\/\/ ?/gm, ''));
}
