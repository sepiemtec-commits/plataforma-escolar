// frontend/js/api.js - Cliente API centralizado

class API {
    constructor() {
        this.baseURL = `${window.location.origin}/api`;
        this.token = localStorage.getItem('token');
    }

    async requisicao(rota, opcoes = {}) {
        const url = `${this.baseURL}${rota}`;
        const token = localStorage.getItem('token');
        this.token = token;
        const headers = {
            'Content-Type': 'application/json',
            ...opcoes.headers
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const resposta = await fetch(url, {
                ...opcoes,
                headers
            });

            if (!resposta.ok) {
                if (resposta.status === 401) {
                    // Token expirado
                    localStorage.removeItem('token');
                    localStorage.removeItem('usuario');
                    window.location.href = 'index.html';
                }
                const erro = await resposta.json();
                throw new Error(erro.mensagem || 'Erro na requisição');
            }

            return await resposta.json();
        } catch (erro) {
            console.error('Erro na API:', erro);
            if (erro instanceof TypeError) {
                throw new Error('Servidor indisponível. Execute: npm start');
            }
            throw erro;
        }
    }

    // AUTENTICAÇÃO
    async login(email, senha) {
        return this.requisicao('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, senha })
        });
    }

    async registrar(dados) {
        return this.requisicao('/auth/registrar', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    async verificarToken() {
        return this.requisicao('/auth/verificar');
    }

    async logout() {
        const resultado = await this.requisicao('/auth/logout', {
            method: 'POST'
        });
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        return resultado;
    }

    // PRESENÇA
    async registrarPresenca(dados) {
        return this.requisicao('/presenca/registrar', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    async registrarPresencaLote(dados) {
        return this.requisicao('/presenca/registrar-lote', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    async obterVisaoGeralPresenca(data, turmaId, disciplina) {
        const params = new URLSearchParams({ data });
        if (turmaId) params.set('turma_id', turmaId);
        if (disciplina) params.set('disciplina', disciplina);
        return this.requisicao(`/presenca/visao-geral?${params}`);
    }

    async listarPresencaTurma(turmaId, data, disciplina) {
        let url = `/presenca/turma/${turmaId}?data=${data}`;
        if (disciplina) url += `&disciplina=${encodeURIComponent(disciplina)}`;
        return this.requisicao(url);
    }

    async listarPresencaAluno(alunoId) {
        return this.requisicao(`/presenca/aluno/${alunoId}`);
    }

    async atualizarPresenca(presencaId, status, observacoes) {
        return this.requisicao(`/presenca/${presencaId}`, {
            method: 'PUT',
            body: JSON.stringify({ status, observacoes })
        });
    }

    async obterEstatisticasPresenca(turmaId) {
        return this.requisicao(`/presenca/estatisticas/${turmaId}`);
    }

    async listarDisciplinas() {
        return this.requisicao('/disciplinas');
    }

    async criarDisciplina(dados) {
        return this.requisicao('/disciplinas', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    async atualizarDisciplina(id, dados) {
        return this.requisicao(`/disciplinas/${id}`, {
            method: 'PUT',
            body: JSON.stringify(dados)
        });
    }

    async excluirDisciplina(id) {
        return this.requisicao(`/disciplinas/${id}`, { method: 'DELETE' });
    }

    // AVALIAÇÃO
    async lancarAvaliacao(dados) {
        return this.requisicao('/avaliacao/lancar', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    async obterGradeAvaliacoes(turmaId, disciplina) {
        return this.requisicao(`/avaliacao/grade/${turmaId}?disciplina=${encodeURIComponent(disciplina)}`);
    }

    async salvarNotaGrade(dados) {
        return this.requisicao('/avaliacao/grade/celula', {
            method: 'PUT',
            body: JSON.stringify(dados)
        });
    }

    async listarNotasAluno(alunoId) {
        return this.requisicao(`/avaliacao/aluno/${alunoId}`);
    }

    async obterBoletim(alunoId) {
        return this.requisicao(`/avaliacao/boletim/${alunoId}`);
    }

    async atualizarAvaliacao(avaliacaoId, nota, observacoes) {
        return this.requisicao(`/avaliacao/${avaliacaoId}`, {
            method: 'PUT',
            body: JSON.stringify({ nota, observacoes })
        });
    }

    async diagnosticarAlunos(turmaId, periodo) {
        return this.requisicao('/avaliacao/diagnosticar', {
            method: 'POST',
            body: JSON.stringify({ turmaId, periodo })
        });
    }

    // CONTEÚDO
    async registrarConteudo(dados) {
        return this.requisicao('/conteudo/registrar', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    async listarConteudoTurma(turmaId) {
        return this.requisicao(`/conteudo/turma/${turmaId}`);
    }

    async obterConteudo(conteudoId) {
        return this.requisicao(`/conteudo/${conteudoId}`);
    }

    async atualizarConteudo(conteudoId, dados) {
        return this.requisicao(`/conteudo/${conteudoId}`, {
            method: 'PUT',
            body: JSON.stringify(dados)
        });
    }

    async deletarConteudo(conteudoId) {
        return this.requisicao(`/conteudo/${conteudoId}`, {
            method: 'DELETE'
        });
    }

    // PAINÉIS
    async carregarPainelDiretor() {
        return this.requisicao('/painel/diretor');
    }

    async salvarConfiguracaoEscola(dados) {
        return this.requisicao('/painel/configuracao', {
            method: 'PUT',
            body: JSON.stringify(dados)
        });
    }

    async carregarPainelCoordenador() {
        return this.requisicao('/painel/coordenador');
    }

    async carregarPainelProfessor() {
        return this.requisicao('/painel/professor');
    }

    async carregarPainelAluno() {
        return this.requisicao('/painel/aluno');
    }

    async carregarPainelSecretaria() {
        return this.requisicao('/painel/secretaria');
    }

    // HORÁRIOS
    async listarHorariosTurma(turmaId, turno) {
        const params = turno ? `?turno=${encodeURIComponent(turno)}` : '';
        return this.requisicao(`/horarios/turma/${turmaId}${params}`);
    }

    async salvarHorariosTurma(turmaId, dados) {
        return this.requisicao(`/horarios/turma/${turmaId}`, {
            method: 'PUT',
            body: JSON.stringify(dados)
        });
    }

    async listarHorariosProfessor(turno) {
        const params = turno ? `?turno=${encodeURIComponent(turno)}` : '';
        return this.requisicao(`/horarios/professor${params}`);
    }

    async listarSlotsHorario() {
        return this.requisicao('/horarios/slots');
    }

    // TURMAS
    async listarTurmas() {
        return this.requisicao('/turmas');
    }

    async obterResumoAlunosTurma(turmaId) {
        return this.requisicao(`/turmas/${turmaId}/resumo-alunos`);
    }

    async criarTurma(dados) {
        return this.requisicao('/turmas', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    async atualizarTurma(turmaId, dados) {
        return this.requisicao(`/turmas/${turmaId}`, {
            method: 'PUT',
            body: JSON.stringify(dados)
        });
    }

    async excluirTurma(turmaId) {
        return this.requisicao(`/turmas/${turmaId}`, {
            method: 'DELETE'
        });
    }

    async transferirAlunoTurma(alunoId, turmaDestinoId) {
        return this.requisicao('/turmas/transferir-aluno', {
            method: 'POST',
            body: JSON.stringify({
                aluno_id: alunoId,
                turma_destino_id: turmaDestinoId
            })
        });
    }

    async cadastrarAluno(dados) {
        return this.requisicao('/turmas/alunos', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    async listarProfessores() {
        return this.requisicao('/turmas/professores/lista');
    }

    // USUÁRIOS
    async listarUsuarios(filtros = {}) {
        const params = new URLSearchParams(filtros).toString();
        return this.requisicao(`/usuarios?${params}`);
    }

    async cadastrarUsuario(dados) {
        return this.requisicao('/usuarios', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    async obterUsuario(usuarioId) {
        return this.requisicao(`/usuarios/${usuarioId}`);
    }

    async atualizarUsuario(usuarioId, dados) {
        return this.requisicao(`/usuarios/${usuarioId}`, {
            method: 'PUT',
            body: JSON.stringify(dados)
        });
    }

    // NOTIFICAÇÕES
    async enviarAlertaFalta(presencaId) {
        return this.requisicao(`/notificacoes/falta/${presencaId}`, {
            method: 'POST'
        });
    }

    async enviarBoletim(alunoId) {
        return this.requisicao(`/notificacoes/boletim/${alunoId}`, {
            method: 'POST'
        });
    }

    async enviarAlertaDesempenho(alunoId, disciplina, media) {
        return this.requisicao(`/notificacoes/desempenho/${alunoId}`, {
            method: 'POST',
            body: JSON.stringify({ disciplina, media })
        });
    }

    // RELATÓRIOS ACADÊMICOS
    async listarAlunosRelatorio(turmaId) {
        const params = turmaId ? `?turma_id=${encodeURIComponent(turmaId)}` : '';
        return this.requisicao(`/relatorios/alunos${params}`);
    }

    async listarTurmasFiltroRelatorio() {
        return this.requisicao('/relatorios/turmas-filtro');
    }

    async obterFichaIndividual(alunoId) {
        return this.requisicao(`/relatorios/ficha-individual/${alunoId}`);
    }

    async obterFichaMatricula(alunoId) {
        return this.requisicao(`/relatorios/ficha-matricula/${alunoId}`);
    }

    async obterBoletimAcademico(alunoId, disciplina) {
        const params = disciplina ? `?disciplina=${encodeURIComponent(disciplina)}` : '';
        return this.requisicao(`/relatorios/boletim/${alunoId}${params}`);
    }

    async listarGestaoBoletins() {
        return this.requisicao('/relatorios/gestao-boletins');
    }

    async _baixarArquivo(url, nomePadrao) {
        const headers = {};
        if (this.token) headers.Authorization = `Bearer ${this.token}`;

        const resposta = await fetch(url, { headers });
        if (!resposta.ok) {
            let mensagem = 'Erro ao baixar arquivo';
            try {
                const erro = await resposta.json();
                mensagem = erro.mensagem || mensagem;
            } catch {}
            throw new Error(mensagem);
        }

        const blob = await resposta.blob();
        const disposition = resposta.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/);
        const nomeArquivo = match ? match[1] : nomePadrao;

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = nomeArquivo;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
    }

    async baixarArquivoAnoLetivo(anoLetivo) {
        const url = `${this.baseURL}/relatorios/arquivo-ano-letivo/${anoLetivo}`;
        return this._baixarArquivo(url, `arquivo-ano-letivo-${anoLetivo}.xls`);
    }

    async baixarFuncionariosXls() {
        const url = `${this.baseURL}/relatorios/funcionarios-xls`;
        return this._baixarArquivo(url, 'funcionarios.xls');
    }

    // HISTÓRICO ESCOLAR
    async listarHistoricoAluno(alunoId) {
        return this.requisicao(`/historico/aluno/${alunoId}`);
    }

    async criarHistorico(dados) {
        return this.requisicao('/historico', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    async obterHistorico(historicoId) {
        return this.requisicao(`/historico/${historicoId}`);
    }

    async salvarNotasHistorico(historicoId, notas) {
        return this.requisicao(`/historico/${historicoId}/notas`, {
            method: 'PUT',
            body: JSON.stringify({ notas })
        });
    }

    async removerHistorico(historicoId) {
        return this.requisicao(`/historico/${historicoId}`, {
            method: 'DELETE'
        });
    }

    // PROMOÇÃO E DECLARAÇÃO
    async previewPromocao(turmaId) {
        const params = turmaId ? `?turma_id=${encodeURIComponent(turmaId)}` : '';
        return this.requisicao(`/promocao/preview${params}`);
    }

    async executarPromocao(turmaId) {
        return this.requisicao('/promocao/executar', {
            method: 'POST',
            body: JSON.stringify({ turma_id: turmaId || null })
        });
    }

    async listarDeclaracoesAluno(alunoId) {
        return this.requisicao(`/promocao/declaracoes/aluno/${alunoId}`);
    }

    async obterDeclaracao(declaracaoId) {
        return this.requisicao(`/promocao/declaracao/${declaracaoId}`);
    }

    async verificarDeclaracao(codigo) {
        return this.requisicao(`/promocao/verificar/${encodeURIComponent(codigo)}`);
    }

    // DOCUMENTOS
    async listarDocumentosUsuario(usuarioId) {
        return this.requisicao(`/documentos/usuario/${usuarioId}`);
    }

    async uploadDocumento(usuarioId, tipo, arquivo) {
        const formData = new FormData();
        formData.append('tipo', tipo);
        formData.append('arquivo', arquivo);

        const url = `${this.baseURL}/documentos/usuario/${usuarioId}`;
        const token = localStorage.getItem('token');
        this.token = token;
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resposta = await fetch(url, { method: 'POST', headers, body: formData });
        let dados = {};
        try {
            dados = await resposta.json();
        } catch {
            if (!resposta.ok) throw new Error('Erro ao enviar documento');
        }

        if (!resposta.ok) {
            if (resposta.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('usuario');
                window.location.href = 'index.html';
            }
            throw new Error(dados.mensagem || 'Erro ao enviar documento');
        }
        return dados;
    }

    urlDownloadDocumento(documentoId) {
        return `${this.baseURL}/documentos/${documentoId}/download`;
    }

    async removerDocumento(documentoId) {
        return this.requisicao(`/documentos/${documentoId}`, { method: 'DELETE' });
    }

    async downloadDocumento(documentoId, nomeArquivo) {
        const url = this.urlDownloadDocumento(documentoId);
        const token = localStorage.getItem('token');
        this.token = token;
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resposta = await fetch(url, { headers });
        if (!resposta.ok) throw new Error('Erro ao baixar documento');
        const blob = await resposta.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = nomeArquivo || 'documento';
        link.click();
        URL.revokeObjectURL(link.href);
    }
}

// Instância global
const api = new API();
