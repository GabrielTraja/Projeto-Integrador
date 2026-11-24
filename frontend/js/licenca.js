// ==========================================================================
// LICENÇA DO SISTEMA: faixa de aviso, botão "Licença" no cabeçalho e janela
// para consultar a situação e ativar uma nova chave.
// ==========================================================================

const licencaUI = {
    situacao: null,

    async carregar() {
        try {
            const resposta = await fetch(`${API_BASE}/api/licenca/status`);
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
            this.situacao = await resposta.json();
        } catch (erro) {
            console.warn('Não foi possível consultar a licença:', erro.message);
            this.situacao = null;
        }
        return this.situacao;
    },

    precisaDeFaixa(s) {
        return s && (s.modo !== 'LICENCIADO' || s.aviso);
    },

    classeFaixa(s) {
        if (s.somenteLeitura) return 'licenca-faixa-bloqueio';
        if (s.aviso) return 'licenca-faixa-aviso';
        return 'licenca-faixa-info';
    },

    renderizarFaixa() {
        document.querySelector('.licenca-faixa')?.remove();
        const s = this.situacao;
        if (!this.precisaDeFaixa(s)) return;

        const faixa = document.createElement('div');
        faixa.className = `licenca-faixa ${this.classeFaixa(s)}`;
        faixa.setAttribute('role', s.somenteLeitura ? 'alert' : 'status');
        faixa.innerHTML = `
            <span>${s.somenteLeitura ? '🔒 ' : s.aviso ? '⏳ ' : 'ℹ️ '}${escapeHtml(s.mensagem)}</span>
            <button type="button" class="licenca-faixa-botao">${s.somenteLeitura || s.aviso ? 'Ativar licença' : 'Ver licença'}</button>
        `;
        faixa.querySelector('button').onclick = () => this.abrir();

        // No PDV a faixa fica acima do catálogo, para não empurrar o terminal de venda para fora da tela.
        const destino = document.querySelector('.pdv-catalog') || document.querySelector('.content') ||
            document.getElementById('caixaLogin');
        if (!destino) return;
        if (destino.id === 'caixaLogin') {
            destino.querySelector('.brand-logo')?.after(faixa);
        } else {
            destino.prepend(faixa);
        }
    },

    adicionarBotaoCabecalho() {
        const perfil = document.querySelector('.user-profile');
        if (!perfil || perfil.querySelector('.btn-licenca')) return;
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'btn-licenca';
        botao.textContent = 'Licença';
        botao.title = 'Situação da licença do sistema';
        botao.onclick = () => this.abrir();
        perfil.insertBefore(botao, perfil.querySelector('.btn-logout'));
    },

    linhaDetalhe(rotulo, valor) {
        return valor ? `<dt>${escapeHtml(rotulo)}</dt><dd>${escapeHtml(valor)}</dd>` : '';
    },

    formatarData(dataIso) {
        if (!dataIso) return '';
        const [ano, mes, dia] = dataIso.split('-');
        return `${dia}/${mes}/${ano}`;
    },

    async abrir() {
        if (document.querySelector('.licenca-overlay')) return;
        const s = await this.carregar() || {};
        const planos = { TESTE: 'Teste', MENSAL: 'Mensal', ANUAL: 'Anual', VITALICIA: 'Vitalícia' };

        const overlay = document.createElement('div');
        overlay.className = 'licenca-overlay';
        overlay.innerHTML = `
            <div class="licenca-modal" role="dialog" aria-modal="true" aria-labelledby="licencaTitulo">
                <div class="licenca-modal-header">
                    <h2 id="licencaTitulo">Licença do sistema</h2>
                    <button type="button" class="licenca-fechar" aria-label="Fechar">&times;</button>
                </div>
                <div class="licenca-modal-corpo">
                    <p class="licenca-situacao ${s.somenteLeitura ? 'licenca-situacao-bloqueio' : ''}">
                        ${escapeHtml(s.mensagem || 'Não foi possível consultar a licença.')}
                    </p>
                    ${s.mensagemLicenca ? `<p class="licenca-erro">Chave salva recusada: ${escapeHtml(s.mensagemLicenca)}</p>` : ''}
                    <dl class="licenca-detalhes">
                        ${this.linhaDetalhe('Plano', planos[s.plano])}
                        ${this.linhaDetalhe('Cliente', s.cliente)}
                        ${this.linhaDetalhe('Válida até', s.plano === 'VITALICIA' ? 'Sem expiração' : this.formatarData(s.expira))}
                        ${this.linhaDetalhe('Atualizações até', s.plano && s.plano !== 'TESTE'
                            ? (s.atualizacoesAte ? this.formatarData(s.atualizacoesAte) : 'Sem limite') : '')}
                        ${this.linhaDetalhe('Versão instalada', s.versao ? `${s.versao} (${this.formatarData(s.lancamentoVersao)})` : '')}
                    </dl>

                    <label class="licenca-rotulo">Código desta máquina</label>
                    <div class="licenca-codigo">
                        <code>${escapeHtml(s.maquina || '—')}</code>
                        <button type="button" class="licenca-copiar">Copiar</button>
                    </div>
                    <small class="licenca-ajuda">Envie este código ao suporte para receber sua chave de licença.</small>

                    <label class="licenca-rotulo" for="licencaChave">Nova chave de licença</label>
                    <textarea id="licencaChave" class="licenca-chave" rows="4" placeholder="Cole aqui a chave recebida (começa com NXG1.)"></textarea>
                    <p class="licenca-retorno" role="status"></p>
                </div>
                <div class="licenca-modal-acoes">
                    <button type="button" class="licenca-cancelar">Fechar</button>
                    <button type="button" class="licenca-ativar">Ativar licença</button>
                </div>
            </div>
        `;

        const fechar = () => {
            overlay.remove();
            document.removeEventListener('keydown', aoTeclar);
        };
        const aoTeclar = (evento) => {
            if (evento.key === 'Escape') fechar();
        };
        overlay.querySelector('.licenca-fechar').onclick = fechar;
        overlay.querySelector('.licenca-cancelar').onclick = fechar;
        overlay.addEventListener('click', (evento) => {
            if (evento.target === overlay) fechar();
        });
        document.addEventListener('keydown', aoTeclar);

        overlay.querySelector('.licenca-copiar').onclick = async (evento) => {
            try {
                await navigator.clipboard.writeText(s.maquina || '');
                evento.target.textContent = 'Copiado!';
            } catch {
                evento.target.textContent = 'Selecione e copie';
            }
        };

        const retorno = overlay.querySelector('.licenca-retorno');
        const botaoAtivar = overlay.querySelector('.licenca-ativar');
        botaoAtivar.onclick = async () => {
            const chave = overlay.querySelector('#licencaChave').value.trim();
            if (!chave) {
                retorno.className = 'licenca-retorno licenca-erro';
                retorno.textContent = 'Cole a chave de licença antes de ativar.';
                return;
            }
            botaoAtivar.disabled = true;
            retorno.className = 'licenca-retorno';
            retorno.textContent = 'Verificando chave...';
            try {
                const resposta = await fetch(`${API_BASE}/api/licenca/ativar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chave })
                });
                const json = await resposta.json().catch(() => ({}));
                if (!resposta.ok) throw new Error(json.erro || `Erro HTTP ${resposta.status}`);
                retorno.className = 'licenca-retorno licenca-sucesso';
                retorno.textContent = `${json.mensagem} ${json.situacao?.mensagem || ''}`;
                setTimeout(() => window.location.reload(), 1500);
            } catch (erro) {
                retorno.className = 'licenca-retorno licenca-erro';
                retorno.textContent = erro.message;
                botaoAtivar.disabled = false;
            }
        };

        document.body.appendChild(overlay);
        overlay.querySelector('#licencaChave').focus();
    }
};

window.licencaUI = licencaUI;

document.addEventListener('DOMContentLoaded', async () => {
    licencaUI.adicionarBotaoCabecalho();
    await licencaUI.carregar();
    licencaUI.renderizarFaixa();
});
