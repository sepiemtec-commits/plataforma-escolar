const DISCIPLINAS_EM_E_NONO = ['Física', 'Química', 'Biologia'];
const DISCIPLINAS_EM_APENAS = ['Sociologia', 'Filosofia'];

const MAPA_NOMES = {
    artes: 'Artes',
    biologia: 'Biologia',
    ciencias: 'Ciências',
    ciências: 'Ciências',
    'educacao fisica': 'Educação Física',
    'educação física': 'Educação Física',
    espanhol: 'Espanhol',
    filosofia: 'Filosofia',
    fisica: 'Física',
    física: 'Física',
    geografia: 'Geografia',
    historia: 'História',
    história: 'História',
    ingles: 'Inglês',
    inglês: 'Inglês',
    literatura: 'Literatura',
    matematica: 'Matemática',
    matemática: 'Matemática',
    portugues: 'Português',
    português: 'Português',
    quimica: 'Química',
    química: 'Química',
    redacao: 'Redação',
    redação: 'Redação',
    robotica: 'Robótica',
    robótica: 'Robótica',
    sociologia: 'Sociologia'
};

const SUFIXO_ROMANO = {
    1: 'I',
    i: 'I',
    l: 'I',
    2: 'II',
    ii: 'II',
    ll: 'II',
    3: 'III',
    iii: 'III',
    4: 'IV',
    iv: 'IV'
};

function removerAcentos(texto) {
    return String(texto).normalize('NFD').replace(/\p{M}/gu, '');
}

function normalizarSufixo(token) {
    if (!token) return null;
    const chave = String(token).trim().toLowerCase();
    return SUFIXO_ROMANO[chave] || String(token).toUpperCase();
}

function canonicalizarBase(base) {
    const bruto = String(base || '').trim().replace(/\s+/g, ' ');
    if (!bruto) return '';

    const chaveAcento = bruto.toLowerCase();
    if (MAPA_NOMES[chaveAcento]) return MAPA_NOMES[chaveAcento];

    const chaveSemAcento = removerAcentos(bruto).toLowerCase();
    if (MAPA_NOMES[chaveSemAcento]) return MAPA_NOMES[chaveSemAcento];

    return bruto
        .split(/\s+/)
        .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase())
        .join(' ');
}

function formatarNomeDisciplina(nome) {
    if (!nome?.trim()) return '';

    let texto = String(nome).trim().replace(/\s+/g, ' ');

    if (/^biologial$/i.test(texto)) return 'Biologia I';

    let sufixo = null;
    let base = texto;

    const comEspaco = texto.match(/^(.+?)\s+([1-4]|I{1,3}|IV|i{1,3}|iv|l{1,3}|L{1,3})$/i);
    if (comEspaco) {
        base = comEspaco[1];
        sufixo = normalizarSufixo(comEspaco[2]);
    } else {
        const colado = texto.match(/^(.+?)([1-4]|I{1,3}|IV|i{1,3}|iv|l{1,3}|L{1,3})$/i);
        if (colado && colado[1].length >= 4) {
            base = colado[1];
            sufixo = normalizarSufixo(colado[2]);
        }
    }

    base = canonicalizarBase(base);
    if (!base) return '';

    return sufixo ? `${base} ${sufixo}` : base;
}

function nomeBaseDisciplina(nome) {
    return formatarNomeDisciplina(nome).replace(/\s+(I|II|III|IV)$/, '');
}

function inferirNivelTurma(turma) {
    if (turma?.nivel) return turma.nivel;

    const ano = Number(turma?.ano);
    const nome = (turma?.nome || '').toUpperCase();

    if (nome.includes('EM') || nome.includes('MÉDIO') || nome.includes('MEDIO')) {
        return 'Ensino Médio';
    }
    if (ano >= 6 && ano <= 9) return 'Fundamental II';
    if (ano >= 10 && ano <= 12) return 'Ensino Médio';
    if (ano >= 1 && ano <= 5) return 'Fundamental I';

    return 'Fundamental I';
}

function disciplinaPermitidaParaTurma(nomeDisciplina, turma) {
    if (!nomeDisciplina?.trim() || !turma) return true;

    const base = nomeBaseDisciplina(nomeDisciplina);
    const nivel = inferirNivelTurma(turma);
    const ano = Number(turma.ano);

    if (DISCIPLINAS_EM_E_NONO.includes(base)) {
        return nivel === 'Ensino Médio' || (nivel === 'Fundamental II' && ano === 9);
    }

    if (DISCIPLINAS_EM_APENAS.includes(base)) {
        return nivel === 'Ensino Médio';
    }

    return true;
}

function filtrarDisciplinasParaTurma(disciplinas, turma) {
    const lista = Array.isArray(disciplinas) ? disciplinas : [];
    return lista.filter(item => {
        const nome = typeof item === 'string' ? item : item?.nome;
        return disciplinaPermitidaParaTurma(nome, turma);
    });
}

function labelRestricaoDisciplina(nomeDisciplina) {
    const base = nomeBaseDisciplina(nomeDisciplina);
    if (DISCIPLINAS_EM_E_NONO.includes(base)) {
        return 'Ensino Médio e 9º ano';
    }
    if (DISCIPLINAS_EM_APENAS.includes(base)) {
        return 'Ensino Médio';
    }
    return null;
}
