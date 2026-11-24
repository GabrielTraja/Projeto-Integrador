const assert = require('node:assert/strict');
const crypto = require('crypto');
const { test } = require('node:test');
const core = require('../src/license/licencaCore');
const { bloquearEscritaSemLicenca } = require('../src/middleware/licenca');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const MAQUINA = 'ABCD-1234-EF56-7890';

function licenca(extra = {}) {
    return {
        v: 1,
        id: 'A1B2C3',
        cliente: 'Cafeteria Teste',
        maquina: MAQUINA,
        plano: 'ANUAL',
        emitida: '2026-11-01',
        expira: '2027-10-31',
        atualizacoes_ate: '2027-10-31',
        ...extra
    };
}

function situacao(extra = {}) {
    return core.calcularSituacao({
        agora: new Date(2026, 10, 17, 10, 0),
        licenca: null,
        erroLicenca: null,
        testeInicio: new Date(2026, 10, 10, 9, 0),
        ultimaExecucao: new Date(2026, 10, 17, 9, 0),
        marcadorAdulterado: false,
        lancamentoVersao: '2026-11-17',
        ...extra
    });
}

test('assina e verifica uma licença para a máquina correta', () => {
    const chave = core.assinarLicenca(licenca(), privateKey);
    assert.match(chave, /^NXG1\.[\w-]+\.[\w-]+$/);
    const resultado = core.verificarLicenca(chave, publicKey, MAQUINA);
    assert.equal(resultado.erro, undefined);
    assert.equal(resultado.dados.cliente, 'Cafeteria Teste');
});

test('aceita a chave com quebras de linha ou espaços colados pelo usuário', () => {
    const chave = core.assinarLicenca(licenca(), privateKey);
    const colada = ` ${chave.slice(0, 20)}\n${chave.slice(20)} `;
    assert.equal(core.verificarLicenca(colada, publicKey, MAQUINA).erro, undefined);
});

test('recusa licença adulterada, de outra máquina ou assinada por outra chave', () => {
    const chave = core.assinarLicenca(licenca(), privateKey);
    const [prefixo, corpo, assinatura] = chave.split('.');
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    dados.expira = '2099-12-31';
    const adulterada = `${prefixo}.${Buffer.from(JSON.stringify(dados)).toString('base64url')}.${assinatura}`;
    assert.match(core.verificarLicenca(adulterada, publicKey, MAQUINA).erro, /adulterada/);

    assert.match(core.verificarLicenca(chave, publicKey, 'FFFF-FFFF-FFFF-FFFF').erro, /outro computador/);

    const outroPar = crypto.generateKeyPairSync('ed25519');
    const falsa = core.assinarLicenca(licenca(), outroPar.privateKey);
    assert.match(core.verificarLicenca(falsa, publicKey, MAQUINA).erro, /adulterada/);

    assert.match(core.verificarLicenca('qualquer coisa', publicKey, MAQUINA).erro, /Formato/);
});

test('não permite emitir licença vitalícia com expiração nem plano com expiração nula', () => {
    assert.throws(() => core.assinarLicenca(licenca({ plano: 'VITALICIA' }), privateKey), /vitalícia/);
    assert.throws(() => core.assinarLicenca(licenca({ expira: null }), privateKey), /vitalícia/);
});

test('período de teste de 30 dias com aviso nos últimos 7 dias', () => {
    const inicio = situacao();
    assert.equal(inicio.modo, 'TESTE');
    assert.equal(inicio.somenteLeitura, false);
    assert.equal(inicio.expira, '2026-12-09');
    assert.equal(inicio.aviso, false);

    const fim = situacao({ agora: new Date(2026, 11, 5, 10, 0), ultimaExecucao: new Date(2026, 11, 5, 9, 0) });
    assert.equal(fim.modo, 'TESTE');
    assert.equal(fim.aviso, true);

    const ultimoDia = situacao({ agora: new Date(2026, 11, 9, 23, 0), ultimaExecucao: new Date(2026, 11, 9, 22, 0) });
    assert.equal(ultimoDia.modo, 'TESTE');

    const expirado = situacao({ agora: new Date(2026, 11, 10, 8, 0), ultimaExecucao: new Date(2026, 11, 10, 7, 0) });
    assert.equal(expirado.modo, 'TESTE_EXPIRADO');
    assert.equal(expirado.somenteLeitura, true);
    assert.deepEqual(expirado.bloqueadoDesde, new Date(2026, 11, 10, 0, 0));
});

test('marcador adulterado encerra o período de teste', () => {
    const resultado = situacao({ marcadorAdulterado: true });
    assert.equal(resultado.modo, 'TESTE_EXPIRADO');
    assert.equal(resultado.bloqueadoDesde, null);
});

test('relógio atrasado em relação à última utilização bloqueia gravações', () => {
    const resultado = situacao({ agora: new Date(2026, 10, 10, 10, 0), ultimaExecucao: new Date(2026, 10, 17, 9, 0) });
    assert.equal(resultado.modo, 'RELOGIO');
    assert.equal(resultado.somenteLeitura, true);
    // Pequenas diferenças (fuso, ajuste automático) são toleradas
    assert.equal(situacao({ agora: new Date(2026, 10, 17, 8, 0) }).modo, 'TESTE');
});

test('licença válida, expirando e expirada', () => {
    const valida = situacao({ licenca: licenca() });
    assert.equal(valida.modo, 'LICENCIADO');
    assert.equal(valida.aviso, false);

    const expirando = situacao({ licenca: licenca({ expira: '2026-11-20' }) });
    assert.equal(expirando.modo, 'LICENCIADO');
    assert.equal(expirando.aviso, true);

    const expirada = situacao({ licenca: licenca({ expira: '2026-11-16', atualizacoes_ate: '2026-11-30' }) });
    assert.equal(expirada.modo, 'EXPIRADO');
    assert.equal(expirada.somenteLeitura, true);
    assert.deepEqual(expirada.bloqueadoDesde, new Date(2026, 10, 17, 0, 0));
});

test('licença vitalícia não expira, mas só libera versões lançadas dentro do prazo de atualizações', () => {
    const vitalicia = licenca({ plano: 'VITALICIA', expira: null, atualizacoes_ate: '2026-12-31' });
    assert.equal(situacao({ licenca: vitalicia }).modo, 'LICENCIADO');

    const semAtualizacoes = situacao({ licenca: { ...vitalicia, atualizacoes_ate: '2026-11-01' } });
    assert.equal(semAtualizacoes.modo, 'ATUALIZACAO_NAO_COBERTA');
    assert.equal(semAtualizacoes.somenteLeitura, true);

    assert.equal(situacao({ licenca: { ...vitalicia, atualizacoes_ate: null } }).modo, 'LICENCIADO');
});

test('modo somente leitura libera consultas e login, mas bloqueia gravações', async () => {
    // Antes de inicializar o serviço, a situação é tratada como bloqueada
    const chamar = (method, path) => new Promise(resolve => {
        const res = {
            status(codigo) { this.codigo = codigo; return this; },
            json(corpo) { resolve({ codigo: this.codigo, corpo }); }
        };
        bloquearEscritaSemLicenca({ method, path }, res, () => resolve({ liberado: true }));
    });

    assert.deepEqual(await chamar('GET', '/produtos'), { liberado: true });
    assert.deepEqual(await chamar('POST', '/auth/login'), { liberado: true });
    assert.deepEqual(await chamar('POST', '/licenca/ativar'), { liberado: true });

    const bloqueado = await chamar('POST', '/produtos');
    assert.equal(bloqueado.codigo, 403);
    assert.equal(bloqueado.corpo.codigo, 'LICENCA_BLOQUEADA');
});
