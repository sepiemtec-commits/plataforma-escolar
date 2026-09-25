const DOC_LABELS = {
    rg: 'RG',
    diploma: 'Diploma / Habilitação',
    comprovante_endereco: 'Comprovante de Endereço',
    pis: 'PIS / PASEP',
    ctps: 'Carteira de Trabalho (CTPS)',
    cnpj: 'CNPJ (PJ / MEI)',
    certidao_nascimento: 'Certidão de Nascimento',
    rg_responsavel: 'RG do Responsável',
    cpf_responsavel: 'CPF do Responsável',
    comprovante_residencia: 'Comprovante de Residência'
};

const DOC_TIPOS_ALUNO = [
    'certidao_nascimento', 'rg_responsavel', 'cpf_responsavel', 'comprovante_residencia'
];

const DOC_TIPOS_FUNCIONARIO = [
    'rg', 'diploma', 'comprovante_endereco', 'pis', 'ctps', 'cnpj'
];

function tiposDocumento(categoria) {
    if (categoria === 'aluno') return DOC_TIPOS_ALUNO;
    return DOC_TIPOS_FUNCIONARIO;
}

function montarGridUpload(container, categoria, prefixo) {
    if (!container) return;
    const tipos = tiposDocumento(categoria);
    container.innerHTML = `
        <h3 class="secao-form doc-titulo">📎 Documentação</h3>
        <p class="doc-ajuda">Envie a certidão de nascimento e demais documentos (PDF, JPG ou PNG — máx. 5 MB cada).</p>
        <div class="doc-grid">
            ${tipos.map(tipo => `
                <div class="doc-item" data-tipo="${escaparHtml(tipo)}">
                    <label for="${escaparHtml(prefixo)}_doc_${escaparHtml(tipo)}">${escaparHtml(DOC_LABELS[tipo] || tipo)}</label>
                    <input type="file" id="${escaparHtml(prefixo)}_doc_${escaparHtml(tipo)}" accept=".pdf,.jpg,.jpeg,.png,.webp">
                    <span class="doc-status"></span>
                </div>
            `).join('')}
        </div>`;
}

async function enviarDocumentosDoGrid(container, usuarioId) {
    const enviados = [];
    const erros = [];
    if (!container || !usuarioId) return { enviados, erros };

    const inputs = container.querySelectorAll('input[type="file"]');
    for (const input of inputs) {
        const item = input.closest('.doc-item');
        const status = item?.querySelector('.doc-status');
        const tipo = item?.dataset.tipo;
        if (!input.files?.length || !tipo) continue;

        if (status) {
            status.textContent = 'Enviando...';
            status.className = 'doc-status doc-enviando';
        }

        try {
            await api.uploadDocumento(usuarioId, tipo, input.files[0]);
            enviados.push(tipo);
            if (status) {
                status.textContent = '✓ Arquivado';
                status.className = 'doc-status doc-ok';
            }
            input.value = '';
        } catch (err) {
            erros.push({ tipo, mensagem: err.message });
            if (status) {
                status.textContent = `Erro: ${err.message}`;
                status.className = 'doc-status doc-erro';
            }
        }
    }

    return { enviados, erros };
}

let modalDocsUsuarioId = null;

function garantirModalDocumentos() {
    let modal = document.getElementById('modalDocumentos');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'modalDocumentos';
    modal.className = 'modal-documentos';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-documentos-conteudo">
            <div class="modal-documentos-header">
                <h2 id="modalDocsTitulo">Documentos</h2>
                <button type="button" class="modal-fechar" id="btnFecharModalDocs" aria-label="Fechar">✕</button>
            </div>
            <div id="modalDocsConteudo">
                <p style="color:#7f8c8d;">Carregando...</p>
            </div>
            <div class="modal-documentos-acoes">
                <button type="button" class="btn" id="btnFecharModalDocs2">Fechar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target.id === 'modalDocumentos') fecharModalDocumentos();
    });
    modal.querySelector('#btnFecharModalDocs').addEventListener('click', fecharModalDocumentos);
    modal.querySelector('#btnFecharModalDocs2').addEventListener('click', fecharModalDocumentos);

    return modal;
}

function fecharModalDocumentos() {
    const modal = document.getElementById('modalDocumentos');
    if (modal) modal.style.display = 'none';
    modalDocsUsuarioId = null;
}

async function renderPainelDocumentos(container, usuarioId, nome, categoria) {
    if (!container || !usuarioId || usuarioId === 'undefined') return;

    container.innerHTML = '<p style="color:#7f8c8d;">Carregando documentos...</p>';

    try {
        const res = await api.listarDocumentosUsuario(usuarioId);
        const docsPorTipo = {};
        (res.documentos || []).forEach(d => { docsPorTipo[d.tipo] = d; });

        const tipos = res.tiposEsperados || tiposDocumento(categoria).map(t => ({
            id: t, label: DOC_LABELS[t] || t
        }));

        container.innerHTML = `
            <table class="tabela doc-tabela">
                <thead>
                    <tr>
                        <th>Documento</th>
                        <th>Arquivo</th>
                        <th>Enviado em</th>
                        <th class="doc-acoes">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${tipos.map(t => {
                        const doc = docsPorTipo[t.id];
                        const data = doc?.dataUpload
                            ? new Date(doc.dataUpload).toLocaleDateString('pt-BR')
                            : '—';
                        return `
                            <tr data-tipo="${escaparHtml(t.id)}">
                                <td>${escaparHtml(t.label)}</td>
                                <td>${doc ? escaparHtml(doc.nomeOriginal) : '<span style="color:#999;">Não enviado</span>'}</td>
                                <td>${escaparHtml(data)}</td>
                                <td class="doc-acoes">
                                    ${doc ? `
                                        <a class="btn btn-pequeno btn-info" href="${escaparHtml(api.urlDownloadDocumento(doc._id))}" target="_blank" rel="noopener">Baixar</a>
                                        <button type="button" class="btn btn-pequeno btn-perigo btn-remover-doc" data-id="${escaparHtml(doc._id)}">Remover</button>
                                    ` : `
                                        <label class="btn btn-pequeno btn-sucesso">
                                            Enviar
                                            <input type="file" class="input-upload-doc-modal" data-tipo="${escaparHtml(t.id)}" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none;">
                                        </label>
                                    `}
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>`;

        container.querySelectorAll('.input-upload-doc-modal').forEach(input => {
            input.addEventListener('change', async () => {
                if (!input.files?.length) return;
                try {
                    await api.uploadDocumento(usuarioId, input.dataset.tipo, input.files[0]);
                    await renderPainelDocumentos(container, usuarioId, nome, categoria);
                } catch (err) {
                    alert(err.message || 'Erro ao enviar documento');
                }
            });
        });

        container.querySelectorAll('.btn-remover-doc').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Remover este documento?')) return;
                try {
                    await api.removerDocumento(btn.dataset.id);
                    await renderPainelDocumentos(container, usuarioId, nome, categoria);
                } catch (err) {
                    alert(err.message || 'Erro ao remover documento');
                }
            });
        });
    } catch (err) {
        container.innerHTML = `<p class="doc-erro-texto">${escaparHtml(err.message || 'Erro ao carregar documentos')}</p>`;
    }
}

async function abrirModalDocumentos(usuarioId, nome, categoria) {
    if (!usuarioId || usuarioId === 'undefined') return;

    const modal = garantirModalDocumentos();
    modalDocsUsuarioId = usuarioId;
    document.getElementById('modalDocsTitulo').textContent = `Documentos — ${nome}`;
    const conteudo = document.getElementById('modalDocsConteudo');
    modal.style.display = 'flex';

    await renderPainelDocumentos(conteudo, usuarioId, nome, categoria);
}
