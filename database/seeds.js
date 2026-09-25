// database/seeds.js - Script para popular banco com dados iniciais

const mongoose = require('mongoose');
const {
    Usuario,
    Escola,
    Turma,
    Presenca,
    Conteudo,
    Avaliacao,
    Desempenho,
    Responsavel,
    HistoricoEscolar,
    Log,
    DisciplinaConfig
} = require('../backend/database/schema');

require('dotenv').config();
const { obterSenhaSeed } = require('../backend/utils/senhaPadrao');

async function popularBancoDados() {
    try {
        const SENHA_SEED = obterSenhaSeed();

        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('📌 Conectado ao MongoDB');

        // Limpar coleções (opcional - descomente para limpar)
        // await Promise.all([
        //     Usuario.deleteMany({}),
        //     Escola.deleteMany({}),
        //     Turma.deleteMany({}),
        //     Presenca.deleteMany({}),
        //     Avaliacao.deleteMany({})
        // ]);
        // console.log('🗑️ Coleções limpas');

        // Criar Escola
        const escola = await Escola.findOne({ cnpj: '12.345.678/0001-00' }) || 
            await Escola.create({
                nome: 'Escola Estadual de Teste',
                cnpj: '12.345.678/0001-00',
                endereco: 'Rua Principal, 123',
                telefone: '(11) 3000-0000',
                email: 'contato@escola.com',
                configuracao: {
                    tipoAvaliacao: 'bimestral',
                    anoLetivo: 2026,
                    alertasWhatsapp: true,
                    avaliacaoComportamental: false
                }
            });

        console.log('✓ Escola criada:', escola.nome);

        await Escola.updateOne(
            { _id: escola._id },
            { $set: { 'configuracao.anoLetivo': 2026 } }
        );
        escola.configuracao = escola.configuracao || {};
        escola.configuracao.anoLetivo = 2026;

        const disciplinasPadrao = [
            { nome: 'Matemática', quantidadeTempos: 5 },
            { nome: 'Português', quantidadeTempos: 4 },
            { nome: 'Ciências', quantidadeTempos: 3 },
            { nome: 'História', quantidadeTempos: 2 },
            { nome: 'Geografia', quantidadeTempos: 2 },
            { nome: 'Educação Física', quantidadeTempos: 3 },
            { nome: 'Biologia', quantidadeTempos: 3 },
            { nome: 'Física', quantidadeTempos: 3 }
        ];

        for (const disc of disciplinasPadrao) {
            const existe = await DisciplinaConfig.findOne({ escola_id: escola._id, nome: disc.nome });
            if (!existe) {
                await DisciplinaConfig.create({ escola_id: escola._id, ...disc });
            }
        }

        console.log('✓ Disciplinas configuradas');

        // Criar Diretor
        const diretor = await Usuario.findOne({ email: 'diretor@escola.com' }) || 
            await Usuario.create({
                nome: 'Dr. Carlos Silva',
                email: 'diretor@escola.com',
                senha: SENHA_SEED,
                cpf: '111.111.111-11',
                whatsapp: '+5511999999999',
                tipo: 'diretor',
                escola_id: escola._id,
                ativo: true
            });

        console.log('✓ Diretor criado:', diretor.nome);

        // Atualizar escola com diretor
        escola.diretor_id = diretor._id;
        await escola.save();

        // Criar Coordenador
        const coordenador = await Usuario.findOne({ email: 'coord@escola.com' }) || 
            await Usuario.create({
                nome: 'Dra. Maria Santos',
                email: 'coord@escola.com',
                senha: SENHA_SEED,
                cpf: '222.222.222-22',
                whatsapp: '+5511988888888',
                tipo: 'coordenador',
                escola_id: escola._id,
                ativo: true
            });

        console.log('✓ Coordenador criado:', coordenador.nome);

        // Criar Secretaria
        const secretaria = await Usuario.findOne({ email: 'secretaria@escola.com' }) ||
            await Usuario.create({
                nome: 'Sra. Paula Mendes',
                email: 'secretaria@escola.com',
                senha: SENHA_SEED,
                cpf: '666.666.666-66',
                whatsapp: '+5511977777777',
                tipo: 'secretaria',
                escola_id: escola._id,
                ativo: true
            });

        console.log('✓ Secretaria criada:', secretaria.nome);

        // Criar Professores
        const professor1 = await Usuario.findOne({ email: 'professor@escola.com' }) || 
            await Usuario.create({
                nome: 'Prof. João Oliveira',
                email: 'professor@escola.com',
                senha: SENHA_SEED,
                cpf: '333.333.333-33',
                whatsapp: '+5511987654321',
                tipo: 'professor',
                escola_id: escola._id,
                disciplina: 'Matemática',
                ativo: true
            });

        const professor2 = await Usuario.findOne({ email: 'prof2@escola.com' }) || 
            await Usuario.create({
                nome: 'Profa. Ana Costa',
                email: 'prof2@escola.com',
                senha: SENHA_SEED,
                cpf: '444.444.444-44',
                whatsapp: '+5511987654322',
                tipo: 'professor',
                escola_id: escola._id,
                disciplina: 'Português',
                ativo: true
            });

        console.log('✓ Professores criados');

        await Usuario.updateOne(
            { email: 'professor@escola.com' },
            { disciplina: 'Matemática', disciplinas: ['Matemática', 'Física'] }
        );
        await Usuario.updateOne(
            { email: 'prof2@escola.com' },
            { disciplina: 'Português', disciplinas: ['Português'] }
        );

        // Criar Alunos
        const alunos = [];
        const dadosAlunos = [
            { nome: 'Aluno Teste Edukante', pai: 'Adriano José', mae: 'Maria Edukante' },
            { nome: 'Bruno César', pai: 'Carlos César', mae: 'Ana César' },
            { nome: 'Diego Lima', pai: 'Paulo Lima', mae: 'Cláudia Lima' },
            { nome: 'Henrique Dourado', pai: 'José Dourado', mae: 'Lucia Dourado' },
            { nome: 'Leonardo Batista', pai: 'Marcos Batista', mae: 'Fernanda Batista' }
        ];

        for (let i = 1; i <= 5; i++) {
            const info = dadosAlunos[i - 1];
            let aluno = await Usuario.findOne({ email: `aluno${i}@escola.com` });
            if (!aluno) {
                aluno = await Usuario.create({
                    nome: info.nome,
                    email: `aluno${i}@escola.com`,
                    senha: SENHA_SEED,
                    cpf: `555.555.555-${String(i).padStart(2, '0')}`,
                    whatsapp: `+551199999999${i}`,
                    tipo: 'aluno',
                    escola_id: escola._id,
                    matriculaNumero: i,
                    dataNascimento: new Date(1994, 0, 6 + i),
                    sexo: i % 2 === 0 ? 'masculino' : 'feminino',
                    endereco: 'Estrada do Encanamento',
                    bairro: 'Casa Forte',
                    cidade: 'Recife',
                    uf: 'PE',
                    cep: '52070-000',
                    turno: 'Manhã',
                    filiacao_pai: info.pai,
                    filiacao_mae: info.mae,
                    ativo: true
                });
            } else {
                await Usuario.updateOne({ _id: aluno._id }, {
                    nome: info.nome,
                    matriculaNumero: i,
                    dataNascimento: new Date(1994, 0, 6 + i),
                    endereco: 'Estrada do Encanamento',
                    bairro: 'Casa Forte',
                    cidade: 'Recife',
                    uf: 'PE',
                    cep: '52070-000',
                    turno: 'Manhã',
                    filiacao_pai: info.pai,
                    filiacao_mae: info.mae
                });
            }
            alunos.push(aluno);
        }

        console.log(`✓ ${alunos.length} Alunos criados`);

        // Criar usuários Responsáveis (login) e vincular aos alunos
        for (let i = 0; i < alunos.length; i++) {
            const aluno = alunos[i];
            const emailResp = i === 0 ? 'responsavel@escola.com' : `responsavel${i + 1}@escola.com`;
            let responsavelUser = await Usuario.findOne({ email: emailResp });
            if (!responsavelUser) {
                responsavelUser = await Usuario.create({
                    nome: `Responsável de ${aluno.nome}`,
                    email: emailResp,
                    senha: SENHA_SEED,
                    cpf: `666.666.666-${String(i + 1).padStart(2, '0')}`,
                    whatsapp: `+551198888888${i}`,
                    tipo: 'responsavel',
                    escola_id: escola._id,
                    ativo: true
                });
            } else {
                await Usuario.updateOne(
                    { _id: responsavelUser._id },
                    {
                        tipo: 'responsavel',
                        escola_id: escola._id,
                        ativo: true,
                        nome: `Responsável de ${aluno.nome}`
                    }
                );
            }

            const vinculo = await Responsavel.findOne({
                usuario_id: responsavelUser._id,
                aluno_id: aluno._id
            });
            if (!vinculo) {
                await Responsavel.findOneAndUpdate(
                    { aluno_id: aluno._id },
                    {
                        usuario_id: responsavelUser._id,
                        aluno_id: aluno._id,
                        grau_parentesco: 'pai',
                        whatsapp: responsavelUser.whatsapp || '+5511988888888',
                        recebeNotificacoes: true
                    },
                    { upsert: true, new: true }
                );
            }
        }

        console.log('✓ Responsáveis criados');

        // Criar Turmas
        await Turma.updateMany(
            { nome: { $in: ['5º Ano A', '5º Ano B'] }, nivel: { $exists: false } },
            { $set: { nivel: 'Fundamental I' } }
        );

        await Turma.updateMany(
            { nivel: { $in: ['Fundamental II', 'Ensino Médio'] } },
            { $set: { professor_id: null } }
        );

        await Turma.updateMany(
            { nome: /EM/i },
            { $set: { nivel: 'Ensino Médio', professor_id: null } }
        );

        await Turma.updateMany(
            { ano: { $gte: 6, $lte: 9 }, nivel: { $exists: false } },
            { $set: { nivel: 'Fundamental II', professor_id: null } }
        );

        await Turma.updateMany(
            { turno: { $exists: false } },
            { $set: { turno: 'Manhã' } }
        );

        // Alunos só em UMA turma (sem matrícula duplicada)
        const metade = Math.ceil(alunos.length / 2);
        const alunosTurmaA = alunos.slice(0, metade).map(a => a._id);
        const alunosTurmaB = alunos.slice(metade).map(a => a._id);

        const turma1 = await Turma.findOne({ nome: '5º Ano A' }) ||
            await Turma.create({
                nome: '5º Ano A',
                nivel: 'Fundamental I',
                ano: 5,
                serie: 'A',
                turno: 'Manhã',
                professor_id: professor1._id,
                escola_id: escola._id,
                alunos: alunosTurmaA
            });

        const turma2 = await Turma.findOne({ nome: '5º Ano B' }) ||
            await Turma.create({
                nome: '5º Ano B',
                nivel: 'Fundamental I',
                ano: 5,
                serie: 'B',
                turno: 'Tarde',
                professor_id: professor2._id,
                escola_id: escola._id,
                alunos: alunosTurmaB
            });

        const turmaFund2 = await Turma.findOne({ nome: '8º Ano A' }) ||
            await Turma.create({
                nome: '8º Ano A',
                nivel: 'Fundamental II',
                ano: 8,
                serie: 'A',
                turno: 'Manhã',
                professor_id: null,
                escola_id: escola._id,
                alunos: []
            });

        const turmaEM = await Turma.findOne({ nome: '2º Ano EM A' }) ||
            await Turma.create({
                nome: '2º Ano EM A',
                nivel: 'Ensino Médio',
                ano: 2,
                serie: 'A',
                turno: 'Noite',
                professor_id: null,
                escola_id: escola._id,
                alunos: []
            });

        console.log('✓ Turmas criadas');

        // Criar algumas Presenças de teste
        for (const aluno of alunos) {
            const presencaExistente = await Presenca.findOne({ aluno_id: aluno._id });
            if (!presencaExistente) {
                await Presenca.create({
                    aluno_id: aluno._id,
                    turma_id: turma1._id,
                    professor_id: professor1._id,
                    disciplina: 'Matemática',
                    tempo: 1,
                    data: new Date(),
                    status: 'presente',
                    notificadoWhatsapp: false
                });
            }
        }

        console.log('✓ Presenças criadas');

        // Criar algumas Avaliações de teste
        const disciplinas = ['Biologia', 'Matemática', 'Português'];
        const bimestres = ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'];
        const notasExemplo = [
            [9, 6.5, 8], [5, 6.5, 6], [6.5, 7.5, 7], [7, 8, 7.5]
        ];

        for (const aluno of alunos) {
            for (const disciplina of disciplinas) {
                for (let b = 0; b < bimestres.length; b++) {
                    const periodo = bimestres[b];
                    const [prova, teste] = notasExemplo[b];

                    const existente = await Avaliacao.findOne({
                        aluno_id: aluno._id,
                        disciplina,
                        periodo,
                        tipo: 'prova_bimestral'
                    });
                    if (!existente) {
                        await Avaliacao.create({
                            aluno_id: aluno._id,
                            professor_id: professor1._id,
                            turma_id: turma1._id,
                            disciplina,
                            tipo: 'prova_bimestral',
                            periodo,
                            nota: prova + (Math.random() * 0.5 - 0.25),
                            peso: 2,
                            dataAplicacao: new Date()
                        });
                        await Avaliacao.create({
                            aluno_id: aluno._id,
                            professor_id: professor1._id,
                            turma_id: turma1._id,
                            disciplina,
                            tipo: 'teste_bimestral',
                            periodo,
                            nota: teste + (Math.random() * 0.5 - 0.25),
                            peso: 1,
                            dataAplicacao: new Date()
                        });
                    }
                }
            }
        }

        console.log('✓ Avaliações criadas');

        // Histórico escolar de exemplo
        for (const aluno of alunos.slice(0, 2)) {
            const histExistente = await HistoricoEscolar.findOne({
                aluno_id: aluno._id,
                anoLetivo: 2015
            });
            if (!histExistente) {
                await HistoricoEscolar.create({
                    aluno_id: aluno._id,
                    escola_id: escola._id,
                    anoLetivo: 2015,
                    serie: '6º Ano / 5ª Série',
                    turma: 'A',
                    turno: 'Manhã',
                    resultado: 'Progressão Plena',
                    instituicao: escola.nome,
                    notas: [
                        { disciplina: 'Matemática', cargaHoraria: 40, nota: 8, faltas: 1 },
                        { disciplina: 'Português', cargaHoraria: 40, nota: 7.5, faltas: 0 },
                        { disciplina: 'Ciências', cargaHoraria: 30, nota: 9, faltas: 0 }
                    ]
                });
            }
        }

        console.log('✓ Histórico escolar criado');

        console.log('\n✅ Banco de dados populado com sucesso!');
        console.log('\n🔐 Usuários de teste (senha do seed):');
        console.log(`  Diretor: diretor@escola.com / ${SENHA_SEED}`);
        console.log(`  Coordenador: coord@escola.com / ${SENHA_SEED}`);
        console.log(`  Secretaria: secretaria@escola.com / ${SENHA_SEED}`);
        console.log(`  Professor: professor@escola.com / ${SENHA_SEED}`);
        console.log(`  Aluno: aluno1@escola.com / ${SENHA_SEED}`);
        console.log(`  Responsável: responsavel@escola.com / ${SENHA_SEED}`);
        if (process.env.NODE_ENV === 'production') {
            console.log('\n⚠️  PRODUÇÃO: altere essas senhas após o primeiro login.');
        }

        process.exit(0);

    } catch (erro) {
        console.error('❌ Erro ao popular banco:', erro);
        process.exit(1);
    }
}

// Executar se for chamado diretamente
if (require.main === module) {
    popularBancoDados();
}

module.exports = { popularBancoDados };
