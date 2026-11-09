const crypto = require('crypto');
const UsuarioModel = require('../models/usuarioModel');

if (process.env.AUTH_TOKEN_SECRET && process.env.AUTH_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_TOKEN_SECRET deve ter pelo menos 32 caracteres.');
}
if (!process.env.AUTH_TOKEN_SECRET) {
    console.warn('AUTH_TOKEN_SECRET não configurado; todas as sessões serão invalidadas ao reiniciar o servidor.');
}
const tokenSecret = process.env.AUTH_TOKEN_SECRET || crypto.randomBytes(32);
const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

function encode(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function criarToken(usuario) {
    const payload = encode({
        id_usuario: usuario.id_usuario,
        exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS
    });
    const signature = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

function validarToken(token) {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return null;

    const expected = crypto.createHmac('sha256', tokenSecret).update(payload).digest();
    let received;
    try {
        received = Buffer.from(signature, 'base64url');
    } catch {
        return null;
    }
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!Number.isInteger(claims.id_usuario) || !Number.isInteger(claims.exp) || claims.exp <= Date.now() / 1000) {
            return null;
        }
        return claims;
    } catch {
        return null;
    }
}

async function autenticar(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer (.+)$/i);
    if (!match) {
        return res.status(401).json({ erro: 'Autenticação obrigatória.' });
    }

    const claims = validarToken(match[1]);
    if (!claims) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });

    try {
        const usuario = await UsuarioModel.buscarPorId(claims.id_usuario);
        if (!usuario || usuario.status !== 'ATIVO') {
            return res.status(401).json({ erro: 'Usuário inválido ou inativo.' });
        }
        req.usuarioAutenticado = usuario;
        return next();
    } catch (error) {
        return next(error);
    }
}

function exigirAutenticacao(req, res, next) {
    return autenticar(req, res, next);
}

function exigirTipos(...tiposPermitidos) {
    return (req, res, next) => {
        if (!req.usuarioAutenticado) return res.status(401).json({ erro: 'Autenticação obrigatória.' });
        if (!tiposPermitidos.includes(Number(req.usuarioAutenticado.id_tipo_usuario))) {
            return res.status(403).json({ erro: 'Você não tem permissão para esta operação.' });
        }
        return next();
    };
}

module.exports = { criarToken, exigirAutenticacao, exigirTipos };
