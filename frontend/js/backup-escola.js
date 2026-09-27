// frontend/js/backup-escola.js — UI compartilhada (diretor / secretaria)

async function carregarPainelBackup() {
    const status = document.getElementById('backupStatus');
    const lista = document.getElementById('listaBackups');
    const inputDrive = document.getElementById('backupDriveUrl');
    if (!status && !lista) return;

    try {
        const [cfgRes, listRes] = await Promise.all([
            api.obterConfigBackup(),
            api.listarBackupsEscola()
        ]);
        const cfg = cfgRes.config || {};
        if (inputDrive) inputDrive.value = cfg.driveFolderUrl || '';

        if (status) {
            const partes = [];
            if (cfg.ultimoBackupEm) {
                partes.push(`Último backup: ${new Date(cfg.ultimoBackupEm).toLocaleString('pt-BR')}`);
            } else {
                partes.push('Nenhum backup gerado ainda.');
            }
            if (cfg.driveFolderId) {
                partes.push('Pasta do Drive cadastrada.');
            } else {
                partes.push('Cadastre o link da pasta do Google Drive.');
            }
            if (cfg.driveProntoNoServidor) {
                partes.push(
                    `Envio automático ativo` +
                    (cfg.emailContaServico
                        ? ` (compartilhe a pasta com ${cfg.emailContaServico}).`
                        : '.')
                );
            } else {
                partes.push(
                    'Envio automático ao Drive ainda não está ativo no servidor VEHO — o arquivo sempre pode ser baixado e enviado manualmente à pasta.'
                );
            }
            if (cfg.ultimoDriveWebViewLink) {
                partes.push(`Último no Drive: ${cfg.ultimoDriveWebViewLink}`);
            }
            status.textContent = partes.join(' ');
        }

        if (lista) {
            const backups = listRes.backups || [];
            if (!backups.length) {
                lista.innerHTML = '<p class="texto-muted">Nenhum backup na lista.</p>';
            } else {
                lista.innerHTML = backups.map((b) => {
                    const quando = b.dataCriacao
                        ? new Date(b.dataCriacao).toLocaleString('pt-BR')
                        : '—';
                    const por = b.geradoPor?.nome || '—';
                    const drive = b.drive?.enviado
                        ? (b.drive.webViewLink
                            ? `<a href="${escaparHtml(b.drive.webViewLink)}" target="_blank" rel="noopener">Ver no Drive</a>`
                            : 'Enviado ao Drive')
                        : (b.drive?.erro
                            ? `<span style="color:#b36b00;">Drive: ${escaparHtml(b.drive.erro)}</span>`
                            : 'Só download');
                    const tam = b.tamanhoBytes
                        ? `${Math.max(1, Math.round(b.tamanhoBytes / 1024))} KB`
                        : '—';
                    return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:12px;margin-bottom:10px;background:#fff;">
                        <strong>${escaparHtml(b.nomeArquivo)}</strong>
                        <p style="margin:6px 0;font-size:13px;color:#566573;">${escaparHtml(quando)} · ${escaparHtml(por)} · ${escaparHtml(tam)} · ${b.registros || 0} registros</p>
                        <p style="margin:0 0 8px;font-size:13px;">${drive}</p>
                        <button type="button" class="btn btn-pequeno" data-dl-backup="${escaparHtml(b._id)}" data-nome="${escaparHtml(b.nomeArquivo)}">Baixar</button>
                    </article>`;
                }).join('');
                lista.querySelectorAll('[data-dl-backup]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        try {
                            await api.downloadBackupEscola(
                                btn.getAttribute('data-dl-backup'),
                                btn.getAttribute('data-nome')
                            );
                        } catch (e) {
                            alert(e.message || 'Erro no download');
                        }
                    });
                });
            }
        }
    } catch (e) {
        if (status) status.textContent = e.message || 'Erro ao carregar backup';
        if (lista) lista.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message || 'Erro')}</p>`;
    }
}

async function salvarPastaDriveBackup() {
    const input = document.getElementById('backupDriveUrl');
    if (!input) return;
    try {
        await api.salvarConfigBackup({ driveFolderUrl: input.value.trim() });
        if (typeof mostrarSucesso === 'function') mostrarSucesso('Pasta do Drive salva');
        else alert('Pasta do Drive salva');
        await carregarPainelBackup();
    } catch (e) {
        if (typeof mostrarErro === 'function') mostrarErro(e.message);
        else alert(e.message || 'Erro ao salvar');
    }
}

async function gerarBackupAgora() {
    const btn = document.getElementById('btnGerarBackup');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Gerando…';
    }
    try {
        const res = await api.gerarBackupEscola(true);
        const msg = res.mensagem || 'Backup gerado';
        if (typeof mostrarSucesso === 'function') mostrarSucesso(msg);
        else alert(msg);
        if (res.backup?._id) {
            try {
                await api.downloadBackupEscola(res.backup._id, res.backup.nomeArquivo);
            } catch {
                /* download opcional se falhar */
            }
        }
        await carregarPainelBackup();
    } catch (e) {
        if (typeof mostrarErro === 'function') mostrarErro(e.message);
        else alert(e.message || 'Erro ao gerar backup');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Gerar backup agora';
        }
    }
}

function configurarEventosBackup() {
    document.getElementById('btnSalvarDriveBackup')?.addEventListener('click', salvarPastaDriveBackup);
    document.getElementById('btnGerarBackup')?.addEventListener('click', gerarBackupAgora);
}
