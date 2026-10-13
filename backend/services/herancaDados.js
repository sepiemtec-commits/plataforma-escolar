// Lê dados vindos de outra plataforma (planilha, documento, PDF, texto ou JSON)
// e matricula alunos nesta escola. Uma linha ruim não interrompe o restante.
const zlib = require('zlib');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const { Usuario, Turma } = require('../database/schema');

const LIMITE_LINHAS = 5000;
const LIMITE_IGNORADOS = 40;

const ALIAS = {
  nome: 'nome',
  aluno: 'nome',
  estudante: 'nome',
  name: 'nome',
  alunoa: 'nome',
  email: 'email',
  eemail: 'email',
  correio: 'email',
  cpf: 'cpf',
  documento: 'cpf',
  matricula: 'matricula',
  ra: 'matricula',
  registro: 'matricula',
  codigo: 'matricula',
  turma: 'turma',
  classe: 'turma',
  sala: 'turma',
  nivel: 'nivel',
  ensino: 'nivel',
  etapa: 'nivel',
  segmento: 'nivel',
  ano: 'ano',
  serieano: 'ano',
  serie: 'serie',
  letra: 'serie',
  turno: 'turno',
  periodo: 'turno',
  nascimento: 'nascimento',
  datanascimento: 'nascimento',
  dn: 'nascimento'
};

function semAcento(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function limpar(valor) {
  if (valor == null) return '';
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  return String(valor).replace(/\s+/g, ' ').trim();
}

function mapearObjeto(obj) {
  const saida = {};
  if (!obj || typeof obj !== 'object') return saida;
  Object.keys(obj).forEach((chave) => {
    const campo = ALIAS[semAcento(chave)];
    const valor = limpar(obj[chave]);
    if (campo && valor) saida[campo] = valor;
  });
  return saida;
}

function linhaUtil(linha) {
  return Boolean(linha && (linha.nome || linha.email || linha.cpf || linha.matricula));
}

function linhasDePlanilha(buffer) {
  const livro = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: false });
  const linhas = [];
  (livro.SheetNames || []).forEach((nome) => {
    const folha = livro.Sheets[nome];
    if (!folha) return;
    const objetos = XLSX.utils.sheet_to_json(folha, { defval: '', raw: false });
    objetos.forEach((obj) => {
      const linha = mapearObjeto(obj);
      if (linhaUtil(linha)) linhas.push(linha);
    });
    if (objetos.length) return;
    const matriz = XLSX.utils.sheet_to_json(folha, { header: 1, defval: '', raw: false });
    matriz.forEach((celulas) => {
      const texto = (celulas || []).map(limpar).filter(Boolean).join(' ');
      if (texto) linhas.push(...linhasDeTexto(texto));
    });
  });
  return linhas;
}

function linhasDeTexto(texto) {
  const linhas = [];
  String(texto || '').split(/\r?\n/).forEach((bruta) => {
    const linha = bruta.trim();
    if (!linha || linha.length < 3) return;
    if (/[;,]/.test(linha) && !linha.includes(' ')) {
      const pedacos = linha.split(/[;,]/).map((p) => p.trim());
      if (pedacos.length >= 2) {
        const obj = { nome: pedacos[0] };
        pedacos.slice(1).forEach((p) => {
          if (p.includes('@')) obj.email = p;
          else if (/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(p)) obj.cpf = p;
          else if (!obj.turma) obj.turma = p;
        });
        if (linhaUtil(obj)) linhas.push(obj);
        return;
      }
    }
    const email = linha.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    const cpf = linha.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    let nome = linha;
    if (email) nome = nome.replace(email[0], ' ');
    if (cpf) nome = nome.replace(cpf[0], ' ');
    nome = nome.replace(/[|;,/]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (nome.length < 5 && !email && !cpf) return;
    if (/^(nome|aluno|email|cpf|turma|planilha|pagina)$/i.test(nome)) return;
    linhas.push({
      nome,
      email: email ? email[0] : '',
      cpf: cpf ? cpf[0] : ''
    });
  });
  return linhas.filter(linhaUtil);
}

function textoPdf(buffer) {
  const cru = buffer.toString('latin1');
  const pedacos = [];
  let indice = 0;
  while (indice < cru.length) {
    const marca = cru.indexOf('stream', indice);
    if (marca < 0) break;
    let inicio = marca + 6;
    if (cru.charCodeAt(inicio) === 13) inicio += 1;
    if (cru.charCodeAt(inicio) === 10) inicio += 1;
    const fim = cru.indexOf('endstream', inicio);
    if (fim < 0) break;
    const bloco = Buffer.from(cru.slice(inicio, fim), 'latin1');
    let dados = bloco;
    try {
      dados = zlib.inflateSync(bloco);
    } catch (_) {
      try { dados = zlib.unzipSync(bloco); } catch (__) { dados = bloco; }
    }
    const texto = dados.toString('latin1');
    const literais = texto.match(/\((?:\\.|[^\\)]){2,200}\)/g) || [];
    literais.forEach((item) => {
      const interno = item.slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\([()\\])/g, '$1');
      if (/[A-Za-zÀ-ÿ]/.test(interno)) pedacos.push(interno);
    });
    indice = fim + 9;
  }
  return pedacos.join('\n');
}

async function textoDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const arquivo = zip.file('word/document.xml');
  if (!arquivo) return '';
  const xml = await arquivo.async('string');
  return xml
    .replace(/<w:p[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function textoDocBinario(buffer) {
  const utf16 = buffer.toString('utf16le');
  const trechos = utf16.match(/[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .@'"-]{4,120}/g) || [];
  return trechos.filter((t) => /[A-Za-zÀ-ÿ]{3}/.test(t) && !/^[\0-\x1f]/.test(t)).join('\n');
}

function linhasDeJson(buffer) {
  const dados = JSON.parse(buffer.toString('utf8'));
  const lista = Array.isArray(dados)
    ? dados
    : (dados && (dados.alunos || dados.dados || dados.registros || dados.rows)) || [];
  if (!Array.isArray(lista)) return [];
  return lista.map(mapearObjeto).filter(linhaUtil);
}

function linhasDeHtml(texto) {
  const linhas = [];
  const tabelas = String(texto).match(/<tr[\s\S]*?<\/tr>/gi) || [];
  tabelas.forEach((tr) => {
    const celulas = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (celulas.length >= 2) {
      linhas.push(mapearObjeto({
        nome: celulas[0],
        email: celulas.find((c) => c.includes('@')) || '',
        cpf: celulas.find((c) => /\d{3}/.test(c) && c !== celulas[0]) || '',
        turma: celulas[celulas.length - 1]
      }));
    }
  });
  if (linhas.filter(linhaUtil).length) return linhas.filter(linhaUtil);
  return linhasDeTexto(String(texto).replace(/<[^>]+>/g, '\n'));
}

async function lerArquivo(buffer, nomeArquivo) {
  const avisos = [];
  const nome = String(nomeArquivo || 'arquivo').toLowerCase();
  const ext = (nome.match(/\.([a-z0-9]+)$/) || [, ''])[1];
  let linhas = [];

  const tentar = async (rotulo, fn) => {
    try {
      const achadas = await fn();
      if (Array.isArray(achadas) && achadas.length) linhas = linhas.concat(achadas);
    } catch (erro) {
      avisos.push(`${rotulo}: ${erro.message || 'não foi possível ler esta parte'}`);
    }
  };

  if (['xlsx', 'xls', 'ods', 'csv', 'fods'].includes(ext) || !ext) {
    await tentar('Planilha', () => linhasDePlanilha(buffer));
  }
  if (!linhas.length && (ext === 'json' || ext === '')) {
    await tentar('JSON', () => linhasDeJson(buffer));
  }
  if (!linhas.length && ext === 'docx') {
    await tentar('DOCX', async () => linhasDeTexto(await textoDocx(buffer)));
  }
  if (!linhas.length && ext === 'doc') {
    await tentar('DOC', () => linhasDeTexto(textoDocBinario(buffer)));
  }
  if (!linhas.length && ext === 'pdf') {
    await tentar('PDF', () => {
      const texto = textoPdf(buffer);
      if (!texto.trim()) {
        avisos.push('O PDF não tem texto selecionável (pode ser uma imagem escaneada). Envie a planilha XLS ou CSV.');
      }
      return linhasDeTexto(texto);
    });
  }
  if (!linhas.length && (ext === 'html' || ext === 'htm')) {
    await tentar('HTML', () => linhasDeHtml(buffer.toString('utf8')));
  }
  if (!linhas.length) {
    await tentar('Texto', () => {
      const texto = buffer.toString('utf8');
      if (texto.includes('\u0000')) return [];
      if (texto.trim().startsWith('<')) return linhasDeHtml(texto);
      return linhasDeTexto(texto);
    });
  }
  if (!linhas.length && !['xlsx', 'xls', 'ods', 'csv'].includes(ext)) {
    await tentar('Planilha', () => linhasDePlanilha(buffer));
  }

  linhas = linhas.filter((linha) => {
    const nome = linha.nome || '';
    if (/[\u0000-\u001f]/.test(nome)) return false;
    if (nome && !/[A-Za-zÀ-ÿ]/.test(nome) && !linha.email && !linha.cpf) return false;
    return true;
  });

  if (linhas.length > LIMITE_LINHAS) {
    avisos.push(`Foram lidas só as primeiras ${LIMITE_LINHAS} linhas.`);
    linhas = linhas.slice(0, LIMITE_LINHAS);
  }

  return { linhas, avisos };
}

function classificarTurma(linha) {
  const texto = semAcento(`${linha.nivel || ''} ${linha.turma || ''}`);
  let ano = parseInt(String(linha.ano || '').replace(/\D/g, ''), 10);
  if (!ano) {
    const noNome = String(linha.turma || '').match(/(\d{1,2})/);
    ano = noNome ? parseInt(noNome[1], 10) : 0;
  }
  const ehMedio = texto.includes('medio') || texto.includes('anoem') || /em[a-d]$/.test(texto);
  let nivel = 'Fundamental I';
  if (ehMedio) {
    nivel = 'Ensino Médio';
    if (!ano || ano > 3) ano = ano && ano <= 3 ? ano : 1;
  } else if (texto.includes('fundamentalii') || texto.includes('fund2') || (ano >= 6 && ano <= 9)) {
    nivel = 'Fundamental II';
  } else if (!ano || ano > 5) {
    ano = ano && ano <= 5 ? ano : 5;
  }
  if (nivel === 'Ensino Médio' && (ano < 1 || ano > 3)) ano = 1;
  if (nivel === 'Fundamental II' && (ano < 6 || ano > 9)) ano = 8;
  if (nivel === 'Fundamental I' && (ano < 1 || ano > 5)) ano = 5;
  const serie = limpar(linha.serie) || 'A';
  const turnoBruto = semAcento(linha.turno);
  let turno = 'Manhã';
  if (turnoBruto.includes('tard')) turno = 'Tarde';
  else if (turnoBruto.includes('noit')) turno = 'Noite';
  else if (turnoBruto.includes('integr')) turno = 'Integral';
  const nome = limpar(linha.turma) || (
    nivel === 'Ensino Médio' ? `${ano}º Ano EM ${serie}` : `${ano}º Ano ${serie}`
  );
  return { nome, nivel, ano, serie: serie.slice(0, 4), turno };
}

function emailEstavel(linha, escolaId) {
  const informado = limpar(linha.email).toLowerCase();
  if (informado.includes('@') && informado.length < 120) return informado;
  const base = semAcento(linha.cpf || linha.matricula || linha.nome).slice(0, 40) || 'aluno';
  return `imp.${base}.${String(escolaId).slice(-6)}@importado.veho`;
}

function resumirIgnorado(lista, item) {
  if (lista.length < LIMITE_IGNORADOS) lista.push(item);
}

async function garantirTurma(escolaId, linha, cache) {
  if (!limpar(linha.turma) && !limpar(linha.nivel) && !limpar(linha.ano)) return null;
  const dados = classificarTurma(linha);
  const chave = `${dados.nivel}|${dados.nome}|${dados.turno}`;
  if (cache.has(chave)) return cache.get(chave);
  let turma = await Turma.findOne({ escola_id: escolaId, nome: dados.nome, nivel: dados.nivel });
  let nova = false;
  if (!turma) {
    turma = await Turma.create({
      nome: dados.nome,
      nivel: dados.nivel,
      ano: dados.ano,
      serie: dados.serie,
      turno: dados.turno,
      escola_id: escolaId,
      alunos: []
    });
    nova = true;
  }
  cache.set(chave, { turma, nova });
  return cache.get(chave);
}

async function importarHeranca({ escolaId, buffer, nomeArquivo, senhaInicial }) {
  if (!buffer || !buffer.length) {
    return {
      sucesso: true,
      lidos: 0,
      criados: 0,
      atualizados: 0,
      turmasCriadas: 0,
      ignorados: [],
      avisos: ['Nenhum arquivo foi enviado.']
    };
  }

  const lido = await lerArquivo(buffer, nomeArquivo);
  const resultado = {
    sucesso: true,
    lidos: lido.linhas.length,
    criados: 0,
    atualizados: 0,
    turmasCriadas: 0,
    ignorados: [],
    avisos: lido.avisos.slice()
  };
  const cacheTurmas = new Map();

  for (let i = 0; i < lido.linhas.length; i += 1) {
    const linha = lido.linhas[i];
    const referencia = linha.nome || linha.email || `linha ${i + 1}`;
    try {
      if (!limpar(linha.nome) || limpar(linha.nome).length < 3) {
        resumirIgnorado(resultado.ignorados, `${referencia}: sem nome utilizável`);
        continue;
      }
      const email = emailEstavel(linha, escolaId);
      const cpf = limpar(linha.cpf);
      let aluno = await Usuario.findOne({ email });
      if (!aluno && cpf) aluno = await Usuario.findOne({ cpf });

      if (aluno && String(aluno.escola_id || '') !== String(escolaId)) {
        resumirIgnorado(resultado.ignorados, `${referencia}: já existe em outra escola`);
        continue;
      }
      if (aluno && aluno.tipo && aluno.tipo !== 'aluno') {
        resumirIgnorado(resultado.ignorados, `${referencia}: o e-mail pertence a um ${aluno.tipo}`);
        continue;
      }

      if (!aluno) {
        aluno = await Usuario.create({
          nome: limpar(linha.nome).slice(0, 120),
          email,
          senha: senhaInicial,
          cpf: cpf || undefined,
          tipo: 'aluno',
          escola_id: escolaId,
          matriculaNumero: parseInt(String(linha.matricula || '').replace(/\D/g, ''), 10) || undefined,
          ativo: true,
          turno: classificarTurma(linha).turno
        });
        resultado.criados += 1;
      } else {
        aluno.nome = limpar(linha.nome).slice(0, 120);
        if (cpf && !aluno.cpf) aluno.cpf = cpf;
        aluno.ativo = true;
        await aluno.save();
        resultado.atualizados += 1;
      }

      const achada = await garantirTurma(escolaId, linha, cacheTurmas);
      if (achada?.turma) {
        if (achada.nova) resultado.turmasCriadas += 1;
        achada.nova = false;
        await Turma.updateMany(
          { escola_id: escolaId, alunos: aluno._id, _id: { $ne: achada.turma._id } },
          { $pull: { alunos: aluno._id } }
        );
        await Turma.updateOne({ _id: achada.turma._id }, { $addToSet: { alunos: aluno._id } });
      }
    } catch (erro) {
      resumirIgnorado(resultado.ignorados, `${referencia}: ${erro.message || 'não gravado'}`);
    }
  }

  if (!resultado.lidos) {
    resultado.avisos.push('Nenhuma linha de aluno foi reconhecida. Inclua colunas como nome, e-mail, CPF e turma.');
  }
  const extraIgnorados = Math.max(0, (lido.linhas.length - resultado.criados - resultado.atualizados) - resultado.ignorados.length);
  if (extraIgnorados > 0) {
    resultado.avisos.push(`Mais ${extraIgnorados} linha(s) foram ignoradas além das listadas.`);
  }
  return resultado;
}

module.exports = {
  lerArquivo,
  importarHeranca,
  mapearObjeto
};
