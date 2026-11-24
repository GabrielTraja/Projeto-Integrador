// ==========================================================================
// NÚCLEO DO LICENCIAMENTO (funções puras, sem banco de dados)
// --------------------------------------------------------------------------
// Formato da chave:  NXG1.<dados em base64url>.<assinatura Ed25519 em base64url>
// Somente quem possui a chave PRIVADA (fora do repositório) consegue emitir
// chaves válidas; o sistema instalado conhece apenas a chave PÚBLICA.
// ==========================================================================
const crypto = require('crypto');

const PREFIXO = 'NXG1';
const PLANOS = ['TESTE', 'MENSAL', 'ANUAL', 'VITALICIA'];
const DIAS_TESTE = 30;
const DIAS_AVISO = 7;
const TOLERANCIA_RELOGIO_MS = 48 * 60 * 60 * 1000;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const CODIGO_MAQUINA = /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/;

function dataValida(valor) {
    if (typeof valor !== 'string' || !DATA_ISO.test(valor)) return false;
    const [ano, mes, dia] = valor.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

// Data local no formato AAAA-MM-DD
function dataLocal(data = new Date()) {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
}

// Diferença em dias corridos entre duas datas AAAA-MM-DD (fim - inicio)
function diasEntre(inicio, fim) {
    const [a1, m1, d1] = inicio.split('-').map(Number);
    const [a2, m2, d2] = fim.split('-').map(Number);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

function somarDias(dataIso, dias) {
    const [ano, mes, dia] = dataIso.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia + dias));
    return data.toISOString().slice(0, 10);
}

// Início do dia seguinte (horário local) a uma data AAAA-MM-DD
function inicioDoDiaSeguinte(dataIso) {
    const [ano, mes, dia] = dataIso.split('-').map(Number);
    return new Date(ano, mes - 1, dia + 1, 0, 0, 0, 0);
}

function codigoMaquina(identificadorBruto) {
    const hash = crypto.createHash('sha256').update(`nexagusto:${identificadorBruto}`).digest('hex');
    return hash.slice(0, 16).toUpperCase().match(/.{4}/g).join('-');
}

function validarDados(dados) {
    if (!dados || typeof dados !== 'object') return 'Conteúdo da licença inválido.';
    if (dados.v !== 1) return 'Versão de licença não suportada.';
    if (typeof dados.id !== 'string' || !dados.id) return 'Identificador da licença ausente.';
    if (typeof dados.cliente !== 'string' || !dados.cliente.trim()) return 'Cliente da licença ausente.';
    if (typeof dados.maquina !== 'string' || !CODIGO_MAQUINA.test(dados.maquina)) return 'Código de máquina da licença inválido.';
    if (!PLANOS.includes(dados.plano)) return 'Plano da licença inválido.';
    if (!dataValida(dados.emitida)) return 'Data de emissão inválida.';
    if (dados.expira !== null && !dataValida(dados.expira)) return 'Data de expiração inválida.';
    if (dados.atualizacoes_ate !== null && !dataValida(dados.atualizacoes_ate)) return 'Data limite de atualizações inválida.';
    if (dados.plano === 'VITALICIA' && dados.expira !== null) return 'Licença vitalícia não pode ter expiração.';
    if (dados.plano !== 'VITALICIA' && dados.expira === null) return 'Somente a licença vitalícia pode não expirar.';
    return null;
}

function assinarLicenca(dados, chavePrivadaPem) {
    const erro = validarDados(dados);
    if (erro) throw new Error(erro);
    const corpo = Buffer.from(JSON.stringify(dados)).toString('base64url');
    const assinatura = crypto.sign(null, Buffer.from(`${PREFIXO}.${corpo}`), chavePrivadaPem).toString('base64url');
    return `${PREFIXO}.${corpo}.${assinatura}`;
}

// Retorna { dados } quando a chave é autêntica ou { erro } com o motivo
function verificarLicenca(chave, chavePublicaPem, maquinaAtual) {
    if (typeof chave !== 'string') return { erro: 'Chave de licença não informada.' };
    const limpa = chave.replace(/\s+/g, '');
    const partes = limpa.split('.');
    if (partes.length !== 3 || partes[0] !== PREFIXO) return { erro: 'Formato de chave de licença inválido.' };

    let assinaturaValida = false;
    try {
        assinaturaValida = crypto.verify(
            null,
            Buffer.from(`${PREFIXO}.${partes[1]}`),
            chavePublicaPem,
            Buffer.from(partes[2], 'base64url')
        );
    } catch {
        assinaturaValida = false;
    }
    if (!assinaturaValida) return { erro: 'Chave de licença inválida ou adulterada.' };

    let dados;
    try {
        dados = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    } catch {
        return { erro: 'Conteúdo da licença ilegível.' };
    }
    const erro = validarDados(dados);
    if (erro) return { erro };
    if (maquinaAtual && dados.maquina !== maquinaAtual) {
        return { erro: 'Esta licença foi emitida para outro computador.' };
    }
    return { dados, chave: limpa };
}

/**
 * Calcula a situação de uso do sistema.
 * @param {object} p
 * @param {Date}   p.agora
 * @param {object|null} p.licenca          dados já verificados da licença ativa
 * @param {string|null} p.erroLicenca      motivo quando a chave salva é inválida
 * @param {Date}   p.testeInicio
 * @param {Date}   p.ultimaExecucao
 * @param {boolean} p.marcadorAdulterado
 * @param {string} p.lancamentoVersao     data (AAAA-MM-DD) de lançamento desta versão
 */
function calcularSituacao(p) {
    const hoje = dataLocal(p.agora);
    const base = {
        somenteLeitura: false,
        aviso: false,
        diasRestantes: null,
        expira: null,
        bloqueadoDesde: null,
        plano: null,
        cliente: null,
        atualizacoesAte: null
    };

    if (p.ultimaExecucao && p.agora.getTime() < p.ultimaExecucao.getTime() - TOLERANCIA_RELOGIO_MS) {
        return {
            ...base,
            modo: 'RELOGIO',
            somenteLeitura: true,
            mensagem: 'A data do computador está anterior à última utilização do sistema. Corrija a data e a hora do Windows para continuar.'
        };
    }

    if (p.licenca) {
        const lic = p.licenca;
        const dadosLicenca = {
            ...base,
            plano: lic.plano,
            cliente: lic.cliente,
            expira: lic.expira,
            atualizacoesAte: lic.atualizacoes_ate
        };

        if (lic.atualizacoes_ate && p.lancamentoVersao && lic.atualizacoes_ate < p.lancamentoVersao) {
            return {
                ...dadosLicenca,
                modo: 'ATUALIZACAO_NAO_COBERTA',
                somenteLeitura: true,
                mensagem: `Sua licença cobre atualizações lançadas até ${formatarData(lic.atualizacoes_ate)}. ` +
                    'Renove o plano de atualizações ou reinstale a versão anterior.'
            };
        }

        if (lic.expira === null) {
            return { ...dadosLicenca, modo: 'LICENCIADO', mensagem: `Licença ${nomePlano(lic.plano)} ativa.` };
        }

        const dias = diasEntre(hoje, lic.expira);
        if (dias < 0) {
            return {
                ...dadosLicenca,
                modo: 'EXPIRADO',
                somenteLeitura: true,
                diasRestantes: dias,
                bloqueadoDesde: inicioDoDiaSeguinte(lic.expira),
                mensagem: `Sua licença expirou em ${formatarData(lic.expira)}. O sistema está em modo somente leitura.`
            };
        }
        return {
            ...dadosLicenca,
            modo: 'LICENCIADO',
            diasRestantes: dias,
            aviso: dias <= DIAS_AVISO,
            mensagem: dias === 0
                ? 'Sua licença expira hoje.'
                : `Licença ${nomePlano(lic.plano)} válida até ${formatarData(lic.expira)} (${dias} dia(s)).`
        };
    }

    // Período de teste
    const fimTeste = somarDias(dataLocal(p.testeInicio), DIAS_TESTE - 1);
    const dias = p.marcadorAdulterado ? -1 : diasEntre(hoje, fimTeste);
    const situacaoTeste = { ...base, plano: 'TESTE', expira: fimTeste, diasRestantes: dias };

    if (p.erroLicenca && dias >= 0) {
        situacaoTeste.mensagemLicenca = p.erroLicenca;
    }

    if (dias < 0) {
        return {
            ...situacaoTeste,
            modo: 'TESTE_EXPIRADO',
            somenteLeitura: true,
            bloqueadoDesde: p.marcadorAdulterado ? null : inicioDoDiaSeguinte(fimTeste),
            mensagem: 'O período de teste terminou. Ative uma licença para voltar a registrar vendas.'
        };
    }
    return {
        ...situacaoTeste,
        modo: 'TESTE',
        aviso: dias <= DIAS_AVISO,
        mensagem: dias === 0
            ? 'Último dia do período de teste.'
            : `Período de teste: ${dias + 1} dia(s) restante(s), até ${formatarData(fimTeste)}.`
    };
}

function nomePlano(plano) {
    return { TESTE: 'de teste', MENSAL: 'mensal', ANUAL: 'anual', VITALICIA: 'vitalícia' }[plano] || '';
}

function formatarData(dataIso) {
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

module.exports = {
    PREFIXO,
    PLANOS,
    DIAS_TESTE,
    DIAS_AVISO,
    dataValida,
    dataLocal,
    diasEntre,
    somarDias,
    codigoMaquina,
    validarDados,
    assinarLicenca,
    verificarLicenca,
    calcularSituacao,
    formatarData
};
