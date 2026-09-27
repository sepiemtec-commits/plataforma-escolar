// frontend/js/backup-escola.js — UI compartilhada (diretor / secretaria)

function toggleDiaSemanaBackup() {
    const freq = document.getElementById('backupFrequencia')?.value;
    const grupo = document.getElementById('grupoBackupDiaSemana');
    if (grupo) grupo.style.display = freq === 'diaria' ? 'none' : '';
}

function preencherFormAgendaBackup(cfg) {
    const alertaDias = document.getElementById('backupAlertaDias');
    const hora = document.getElementById('backupHora');
    const freq = document.getElementById('backupFrequencia');
    const dia = document.getElementById('backupDiaSemana');
    const ativo = document.getElementById('backupAgendaAtivo');
    if (alertaDias) alertaDias.value = cfg.alertaDias != null ? cfg.alertaDias : 7;
    if (hora) hora.value = cfg.hora || '03:00';
    if (freq) freq.value = cfg.frequencia || 'semanal';
    if (dia) dia.value = String(cfg.diaSemana ?? 0);
    if (ativo) ativo.checked = Boolean(cfg.agendaAtivo);
    toggleDiaSemanaBackup();
}

function renderAlertaBackup(cfg) {
    const box = document.getElementById('backupAlerta');
    if (!box) return;
    const alerta = cfg.alerta;
    if (!alerta?.ativo) {
        box.style.display = 'none';
        box.textContent = '';
        return;
    }
    box.style.display = 'block';
    box.style.borderColor = alerta.nivel === 'alto' ? '#e57373' : '#f0c36d';
    box.style.background = alerta.nivel === 'alto' ? '#fdecea' : '#fff8e6';
    box.style.color = alerta.nivel === 'alto' ? '#8a1f1f' : '#7a5b00';
    box.textContent = alerta.mensagem;
}

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
        preencherFormAgendaBackup(cfg);
        renderAlertaBackup(cfg);

        if (status) {
            const partes = [];
            if (cfg.ultimoBackupEm) {
                partes.push(`Último backup: ${new Date(cfg.ultimoBackupEm).toLocaleString('pt-BR')}`);
            } else {
                partes.push('Nenhum backup gerado ainda.');
            }
            if (cfg.agendaAtivo) {
                partes.push(
                    `Agenda ${cfg.frequencia || 'semanal'} às ${cfg.hora || '03:00'}` +
                    (cfg.proximaExecucao
                        ? ` · próxima: ${new Date(cfg.proximaExecucao).toLocaleString('pt-BR')}`
                        : '')
                );
            } else {
                partes.push('Agenda automática desligada.');
            }
            if (cfg.driveFolderId) partes.push('Pasta do Drive cadastrada.');
            else partes.push('Cadastre o link da pasta do Google Drive.');
            if (cfg.ultimaFalhaAgendada) {
                partes.push(`Última falha agendada: ${cfg.ultimaFalhaAgendada}`);
            }
            if (cfg.driveProntoNoServidor) {
                partes.push(
                    `Envio automático ao Drive ativo` +
                    (cfg.emailContaServico ? ` (${cfg.emailContaServico})` : '')
                );
            } else {
                partes.push('Envio automático ao Drive ainda não ativo no servidor — o arquivo fica no VEHO para download.');
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
                            : 'Só no servidor');
                    const tam = b.tamanhoBytes
                        ? `${Math.max(1, Math.round(b.tamanhoBytes / 1024))} KB`
                        : '—';
                    return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:12px;margin-bottom:10px;background:#fff;">
                        <strong>${escaparHtml(b.nomeArquivo)}</strong>
                        <p style="margin:6px 0;font-size:13px;color:#566573;">${escaparHtml(quando)} · ${escaparHtml(por)} · ${escaparHtml(tam)} · ${b.registros || 0} registros</p>
                        <p style="margin:0 0 8px;font-size:13px;">${drive}</p>
                        <button type="button" class="btn btn-pequeno" data-dl-backup="${escaparHtml(b._id)}" data-nome="${escaparHtml(b.nomeArquivo)}">Baixar</button>
                        <button type="button" class="btn btn-pequeno btn-secundario" data-rest-backup="${escaparHtml(b._id)}" style="margin-left:6px;">Restaurar neste VEHO</button>
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
                lista.querySelectorAll('[data-rest-backup]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        if (!confirm('Restaurar este backup nesta escola? Dados com o mesmo ID serão atualizados.')) return;
                        try {
                            const res = await api.restaurarBackupId(btn.getAttribute('data-rest-backup'));
                            alert(res.mensagem || 'Restaurado');
                            await carregarPainelBackup();
                        } catch (e) {
                            alert(e.message || 'Erro ao restaurar');
                        }
                    });
                });
            }
        }
    } catch (e) {
        const msg = e.message || 'Erro ao carregar backup';
        if (status) {
            status.innerHTML = `${escaparHtml(msg)} · <button type="button" class="btn btn-pequeno" id="btnRetryBackup">Tentar de novo</button>`;
            document.getElementById('btnRetryBackup')?.addEventListener('click', carregarPainelBackup);
        }
        if (lista) lista.innerHTML = '';
    }
}

async function salvarPastaDriveBackup() {
    try {
        await api.salvarConfigBackup({
            driveFolderUrl: document.getElementById('backupDriveUrl')?.value?.trim() || '',
            agendaAtivo: document.getElementById('backupAgendaAtivo')?.checked === true,
            frequencia: document.getElementById('backupFrequencia')?.value || 'semanal',
            diaSemana: Number(document.getElementById('backupDiaSemana')?.value || 0),
            hora: document.getElementById('backupHora')?.value || '03:00',
            alertaDias: Number(document.getElementById('backupAlertaDias')?.value || 7)
        });
        if (typeof mostrarSucesso === 'function') mostrarSucesso('Configuração de backup salva');
        else alert('Configuração de backup salva');
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

async function restaurarBackupArquivoAgora() {
    const input = document.getElementById('backupArquivoRestore');
    const arquivo = input?.files?.[0];
    if (!arquivo) {
        alert('Escolha o arquivo .json.gz gerado pelo VEHO');
        return;
    }
    if (!confirm('Restaurar este arquivo nesta escola? Registros com o mesmo ID serão atualizados.')) return;
    const btn = document.getElementById('btnRestaurarBackup');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Restaurando…';
    }
    try {
        const res = await api.restaurarBackupArquivo(arquivo);
        alert(res.mensagem || 'Backup restaurado');
        if (input) input.value = '';
        await carregarPainelBackup();
    } catch (e) {
        alert(e.message || 'Erro ao restaurar');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Restaurar arquivo';
        }
    }
}

/** Mostra faixa de alerta no portal (diretor/secretaria) se backup atrasado. */
async function verificarAlertaBackupPortal(destinoId) {
    const el = document.getElementById(destinoId || 'alertaBackupPortal');
    if (!el || !window.api?.obterConfigBackup) return;
    try {
        const res = await api.obterConfigBackup();
        const alerta = res.config?.alerta;
        if (!alerta?.ativo) {
            el.style.display = 'none';
            return;
        }
        el.style.display = 'block';
        el.innerHTML = `${escaparHtml(alerta.mensagem)} <a href="#" data-ir-backup style="margin-left:8px;">Abrir Backup</a>`;
        el.querySelector('[data-ir-backup]')?.addEventListener('click', (ev) => {
            ev.preventDefault();
            const link = document.querySelector('.menu a[data-secao="backup"], .menu a[data-secao="configuracoes"]');
            if (link) link.click();
            else if (typeof carregarSecao === 'function') carregarSecao('backup');
        });
    } catch {
        el.style.display = 'none';
    }
}

function configurarEventosBackup() {
    document.getElementById('btnSalvarDriveBackup')?.addEventListener('click', salvarPastaDriveBackup);
    document.getElementById('btnGerarBackup')?.addEventListener('click', gerarBackupAgora);
    document.getElementById('btnRestaurarBackup')?.addEventListener('click', restaurarBackupArquivoAgora);
    document.getElementById('backupFrequencia')?.addEventListener('change', toggleDiaSemanaBackup);
}
