// ==========================================================================
// CLIENTE DE API CENTRALIZADO
// ==========================================================================

const API_BASE = (window.location.port === '3000') 
    ? '' 
    : 'http://localhost:3000';

const api = {
    async get(endpoint) {
        try {
            const resposta = await fetch(`${API_BASE}${endpoint}`);
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
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
                method: 'DELETE'
            });
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

