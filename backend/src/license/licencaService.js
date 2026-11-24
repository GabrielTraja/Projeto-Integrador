// ==========================================================================
// SERVIÇO DE LICENÇA: identifica a máquina, controla o período de teste e
// guarda a chave ativa no banco e em arquivos marcadores fora da pasta do
// programa (para que desinstalar/reinstalar não reinicie o teste).
// ==========================================================================
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const db = require('../config/database');
const core = require('./licencaCore');
const { CHAVE_PUBLICA } = require('./chavePublica');
const versao = require('../versao');
const { marcadoresLicenca } = require('../config/ambiente');

const INTERVALO_GRAVACAO_MS = 10 * 60 * 1000;

let estado = null;
let ultimaGravacao = 0;
let gravando = null;

function identificadorBrutoMaquina() {
    if (process.platform === 'win32') {
        try {
            const saida = execFileSync(
                'reg',
                ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'],
                { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
            );
            const guid = saida.match(/MachineGuid\s+REG_SZ\s+([0-9a-f-]{36})/i);
            if (guid) return guid[1].toLowerCase();
        } catch {
            // segue para o identificador alternativo
        }
    } else {
        for (const arquivo of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
            try {
                const id = fsSync.readFileSync(arquivo, 'utf8').trim();
                if (id) return id;
            } catch {
                // tenta o próximo
            }
        }
    }
    return `${os.hostname()}|${os.cpus()[0]?.model || ''}|${os.totalmem()}`;
}

function calcularMac(chaveMac, dados) {
    const conteudo = [dados.teste_inicio, dados.ultima_execucao, dados.adulterado ? 1 : 0, dados.chave || ''].join('|');
    return crypto.createHmac('sha256', chaveMac).update(conteudo).digest('hex');
}

function macConfere(chaveMac, dados) {
    if (typeof dados.mac !== 'string' || !/^[0-9a-f]{64}$/.test(dados.mac)) return false;
    const esperado = Buffer.from(calcularMac(chaveMac, dados), 'hex');
    const recebido = Buffer.from(dados.mac, 'hex');
    return crypto.timingSafeEqual(esperado, recebido);
}

async function garantirTabela() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS licenca_sistema (
            id TINYINT PRIMARY KEY,
            chave TEXT NULL,
            teste_inicio BIGINT NOT NULL,
            ultima_execucao BIGINT NOT NULL,
            adulterado TINYINT(1) NOT NULL DEFAULT 0,
            mac CHAR(64) NOT NULL,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT chk_licenca_sistema_id CHECK (id = 1)
        )
    `);
}

async function lerRegistros() {
    const registros = [];
    const [linhas] = await db.query(
        'SELECT chave, teste_inicio, ultima_execucao, adulterado, mac FROM licenca_sistema WHERE id = 1'
    );
    if (linhas[0]) {
        registros.push({
            origem: 'banco',
            teste_inicio: Number(linhas[0].teste_inicio),
            ultima_execucao: Number(linhas[0].ultima_execucao),
            adulterado: Boolean(linhas[0].adulterado),
            chave: linhas[0].chave || null,
            mac: linhas[0].mac
        });
    }
    for (const arquivo of marcadoresLicenca) {
        let texto;
        try {
            texto = await fs.readFile(arquivo, 'utf8');
        } catch {
            continue; // arquivo inexistente
        }
        try {
            const dados = JSON.parse(Buffer.from(texto.trim(), 'base64').toString('utf8'));
            registros.push({
                origem: arquivo,
                teste_inicio: Number(dados.teste_inicio),
                ultima_execucao: Number(dados.ultima_execucao),
                adulterado: Boolean(dados.adulterado),
                chave: dados.chave || null,
                mac: dados.mac
            });
        } catch {
            registros.push({ origem: arquivo, ilegivel: true });
        }
    }
    return registros;
}

async function persistir() {
    const dados = {
        teste_inicio: estado.testeInicio.getTime(),
        ultima_execucao: estado.ultimaExecucao.getTime(),
        adulterado: estado.adulterado,
        chave: estado.chave || null
    };
    dados.mac = calcularMac(estado.chaveMac, dados);

    await db.query(`
        INSERT INTO licenca_sistema (id, chave, teste_inicio, ultima_execucao, adulterado, mac)
        VALUES (1, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE chave = VALUES(chave), teste_inicio = VALUES(teste_inicio),
            ultima_execucao = VALUES(ultima_execucao), adulterado = VALUES(adulterado), mac = VALUES(mac)
    `, [dados.chave, dados.teste_inicio, dados.ultima_execucao, dados.adulterado ? 1 : 0, dados.mac]);

    const conteudo = Buffer.from(JSON.stringify(dados)).toString('base64');
    for (const arquivo of marcadoresLicenca) {
        try {
            await fs.mkdir(path.dirname(arquivo), { recursive: true });
            await fs.writeFile(arquivo, conteudo, 'utf8');
        } catch (erro) {
            console.warn(`Não foi possível gravar o marcador de licença em ${arquivo}:`, erro.message);
        }
    }
    ultimaGravacao = Date.now();
}

function aplicarChave(chave) {
    estado.chave = null;
    estado.licenca = null;
    estado.erroLicenca = null;
    if (!chave) return;
    const resultado = core.verificarLicenca(chave, CHAVE_PUBLICA, estado.maquina);
    if (resultado.erro) {
        estado.erroLicenca = resultado.erro;
        estado.chave = chave;
        return;
    }
    estado.chave = resultado.chave;
    estado.licenca = resultado.dados;
}

async function inicializar() {
    const bruto = identificadorBrutoMaquina();
    const maquina = core.codigoMaquina(bruto);
    const chaveMac = crypto.createHash('sha256').update(`nexagusto-marcador-v1:${bruto}`).digest();

    await garantirTabela();
    const registros = await lerRegistros();

    const validos = registros.filter(r => !r.ilegivel && Number.isFinite(r.teste_inicio) &&
        Number.isFinite(r.ultima_execucao) && macConfere(chaveMac, r));
    const adulterado = registros.length > validos.length || validos.some(r => r.adulterado);
    if (registros.length > validos.length) {
        console.warn('⚠ Marcador de licença inválido ou alterado manualmente detectado.');
    }

    const agora = Date.now();
    estado = {
        maquina,
        chaveMac,
        testeInicio: new Date(validos.length ? Math.min(...validos.map(r => r.teste_inicio)) : agora),
        ultimaExecucao: new Date(validos.length ? Math.max(...validos.map(r => r.ultima_execucao)) : agora),
        adulterado,
        chave: null,
        licenca: null,
        erroLicenca: null
    };
    aplicarChave(validos.find(r => r.chave)?.chave || null);

    // Grava em todos os locais, restaurando marcadores apagados
    await persistir();

    const situacao = obterSituacao();
    console.log(`🔑 Licença: ${situacao.mensagem} (código da máquina: ${maquina})`);
    return situacao;
}

function registrarUso() {
    const agora = new Date();
    if (agora > estado.ultimaExecucao) estado.ultimaExecucao = agora;
    if (Date.now() - ultimaGravacao > INTERVALO_GRAVACAO_MS && !gravando) {
        gravando = persistir()
            .catch(erro => console.warn('Falha ao registrar uso da licença:', erro.message))
            .finally(() => { gravando = null; });
    }
}

function obterSituacao() {
    if (!estado) {
        return { modo: 'INICIALIZANDO', somenteLeitura: true, mensagem: 'Licença ainda não verificada.' };
    }
    const situacao = core.calcularSituacao({
        agora: new Date(),
        licenca: estado.licenca,
        erroLicenca: estado.erroLicenca,
        testeInicio: estado.testeInicio,
        ultimaExecucao: estado.ultimaExecucao,
        marcadorAdulterado: estado.adulterado,
        lancamentoVersao: versao.lancamento
    });
    // Só avança a "última utilização" quando o relógio não está atrasado
    if (situacao.modo !== 'RELOGIO') registrarUso();
    return {
        ...situacao,
        maquina: estado.maquina,
        versao: versao.versao,
        lancamentoVersao: versao.lancamento,
        idLicenca: estado.licenca?.id || null
    };
}

function erroComStatus(mensagem, status) {
    return Object.assign(new Error(mensagem), { status });
}

async function ativar(chave) {
    if (!estado) throw erroComStatus('Licença ainda não inicializada.', 503);
    const resultado = core.verificarLicenca(chave, CHAVE_PUBLICA, estado.maquina);
    if (resultado.erro) throw erroComStatus(resultado.erro, 400);

    const { dados } = resultado;
    if (dados.atualizacoes_ate && dados.atualizacoes_ate < versao.lancamento) {
        throw erroComStatus(
            `Esta licença cobre atualizações até ${core.formatarData(dados.atualizacoes_ate)}, ` +
            `mas a versão instalada foi lançada em ${core.formatarData(versao.lancamento)}.`,
            400
        );
    }
    if (dados.expira && dados.expira < core.dataLocal()) {
        throw erroComStatus(`Esta licença já expirou em ${core.formatarData(dados.expira)}.`, 400);
    }

    aplicarChave(resultado.chave);
    // Uma chave válida também libera o bloqueio por relógio alterado
    estado.ultimaExecucao = new Date();
    await persistir();
    return obterSituacao();
}

function codigoDestaMaquina() {
    return core.codigoMaquina(identificadorBrutoMaquina());
}

module.exports = { inicializar, obterSituacao, ativar, codigoDestaMaquina };
