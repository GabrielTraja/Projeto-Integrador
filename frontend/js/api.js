// ==========================================================================
// CLIENTE DE API CENTRALIZADO
// ==========================================================================

const configuredApiBase = window.PDV_API_BASE;
const isLocalDevelopment = window.location.protocol === 'file:' ||
    ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = configuredApiBase !== undefined
    ? configuredApiBase.replace(/\/$/, '')
    : isLocalDevelopment && window.location.port !== '3000'
        ? 'http://localhost:3000'
        : '';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function safeImageUrl(value, fallback = 'icones/produtos.png') {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try {
        const url = new URL(value.trim(), window.location.href);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
        return fallback;
    }
}

const api = {
    tratarSessaoExpirada(endpoint, resposta) {
        if (resposta.status === 401 && !endpoint.startsWith('/api/auth/')) {
            localStorage.removeItem('pdv_usuario');
            localStorage.removeItem('pdv_token');
            window.location.href = 'login.html';
        }
    },

    cabecalhos(adicionais = {}) {
        const token = localStorage.getItem('pdv_token');
        return {
            ...adicionais,
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        };
    },

    async get(endpoint) {
        try {
            const resposta = await fetch(`${API_BASE}${endpoint}`, {
                headers: this.cabecalhos()
            });
            this.tratarSessaoExpirada(endpoint, resposta);
            if (!resposta.ok) {
                const erroData = await resposta.json().catch(() => ({}));
                throw new Error(erroData.erro || `Erro HTTP ${resposta.status}`);
            }
            return await resposta.json();
        } catch (erro) {
            console.error(`Erro GET ${endpoint}:`, erro);
            throw erro;
        }
    },

    async post(endpoint, dados) {
        try {
            const resposta = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: this.cabecalhos({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(dados)
            });
            this.tratarSessaoExpirada(endpoint, resposta);
            const json = await resposta.json().catch(() => ({}));
            if (!resposta.ok) {
                throw new Error(json.erro || `Erro HTTP ${resposta.status}`);
            }
            return json;
        } catch (erro) {
            console.error(`Erro POST ${endpoint}:`, erro);
            throw erro;
        }
    },

    async put(endpoint, dados) {
        try {
            const resposta = await fetch(`${API_BASE}${endpoint}`, {
                method: 'PUT',
                headers: this.cabecalhos({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(dados)
            });
            this.tratarSessaoExpirada(endpoint, resposta);
            const json = await resposta.json().catch(() => ({}));
            if (!resposta.ok) {
                throw new Error(json.erro || `Erro HTTP ${resposta.status}`);
            }
            return json;
        } catch (erro) {
            console.error(`Erro PUT ${endpoint}:`, erro);
            throw erro;
        }
    },

    async delete(endpoint) {
        try {
            const resposta = await fetch(`${API_BASE}${endpoint}`, {
                method: 'DELETE',
                headers: this.cabecalhos()
            });
            this.tratarSessaoExpirada(endpoint, resposta);
            const json = await resposta.json().catch(() => ({}));
            if (!resposta.ok) {
                throw new Error(json.erro || `Erro HTTP ${resposta.status}`);
            }
            return json;
        } catch (erro) {
            console.error(`Erro DELETE ${endpoint}:`, erro);
            throw erro;
        }
    }
};
