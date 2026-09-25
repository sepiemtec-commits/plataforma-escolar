// frontend/js/assinar.js
(function () {
    const apiBase = `${window.location.origin}/api`;
    const params = new URLSearchParams(window.location.search);
    const planosGrid = document.getElementById('planosGrid');
    const secaoForm = document.getElementById('secaoForm');
    const form = document.getElementById('formAssinar');
    const erroEl = document.getElementById('mensagemErro');
    const okEl = document.getElementById('mensagemSucesso');

    function mostrarErro(msg) {
        erroEl.textContent = msg;
        erroEl.style.display = 'block';
        okEl.style.display = 'none';
    }

    function mostrarOk(msg) {
        okEl.textContent = msg;
        okEl.style.display = 'block';
        erroEl.style.display = 'none';
    }

    function selecionarPlano(planoId, nome) {
        document.getElementById('plano').value = planoId;
        document.getElementById('planoSelecionadoLabel').textContent = nome;
        secaoForm.hidden = false;
        document.querySelectorAll('.plano-card').forEach((c) => {
            c.classList.toggle('ativo', c.dataset.plano === planoId);
        });
        secaoForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function carregarPlanos() {
        const res = await fetch(`${apiBase}/assinatura/planos`);
        const data = await res.json();
        if (!data.sucesso) throw new Error(data.mensagem || 'Falha ao carregar planos');

        if (data.modoDev) {
            mostrarOk('Modo desenvolvimento: a escola será ativada sem cobrança Stripe.');
        }

        planosGrid.innerHTML = data.planos.map((p) => `
            <article class="plano-card" data-plano="${p.id}">
                <h2>${p.nome}</h2>
                <p class="preco">${p.valorExibicao}</p>
                <p>${p.descricao}</p>
                <ul>${(p.destaque || []).map((d) => `<li>✓ ${d}</li>`).join('')}</ul>
                <button type="button" data-escolher="${p.id}" data-nome="${p.nome}">Escolher</button>
            </article>
        `).join('');

        planosGrid.querySelectorAll('[data-escolher]').forEach((btn) => {
            btn.addEventListener('click', () => selecionarPlano(btn.dataset.escolher, btn.dataset.nome));
        });

        const planoUrl = params.get('plano');
        if (planoUrl && data.planos.some((p) => p.id === planoUrl)) {
            const p = data.planos.find((x) => x.id === planoUrl);
            selecionarPlano(p.id, p.nome);
        }
        if (params.get('cancelado') === '1') {
            mostrarErro('Checkout cancelado. Você pode tentar novamente.');
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnAssinar');
        btn.disabled = true;
        btn.textContent = 'Processando...';
        erroEl.style.display = 'none';

        try {
            if (!document.getElementById('aceiteTermos').checked) {
                throw new Error('Aceite os Termos e a Política de Privacidade.');
            }

            const payload = {
                nomeEscola: document.getElementById('nomeEscola').value.trim(),
                cnpj: document.getElementById('cnpj').value.trim(),
                emailEscola: document.getElementById('emailEscola').value.trim(),
                telefone: document.getElementById('telefone').value.trim() || undefined,
                endereco: document.getElementById('endereco').value.trim() || undefined,
                adminNome: document.getElementById('adminNome').value.trim(),
                adminEmail: document.getElementById('adminEmail').value.trim(),
                adminSenha: document.getElementById('adminSenha').value,
                plano: document.getElementById('plano').value,
                aceiteTermos: true
            };

            const res = await fetch(`${apiBase}/assinatura/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || !data.sucesso) {
                throw new Error(data.mensagem || 'Não foi possível iniciar a assinatura');
            }

            if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
                return;
            }
            if (data.redirectUrl) {
                window.location.href = data.redirectUrl;
                return;
            }
            mostrarOk(data.mensagem || 'Escola criada. Faça login.');
        } catch (err) {
            mostrarErro(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Continuar para pagamento';
        }
    });

    carregarPlanos().catch((err) => mostrarErro(err.message));
})();
