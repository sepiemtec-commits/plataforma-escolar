// backend/server.js - Servidor Express Principal

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const app = express();

// ==================== VALIDAÇÃO DE VARIÁVEIS ====================
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI não definida no .env');
  process.exit(1);
}

// ==================== MIDDLEWARE ====================
app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || '*', // permite funcionar mesmo se não configurar
  credentials: true
}));

app.use(morgan('dev'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== CONEXÃO MONGODB ====================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✓ Conectado ao MongoDB');
  })
  .catch(err => {
    console.error('✗ Erro ao conectar MongoDB:', err.message);
    process.exit(1);
  });

// ==================== ROTAS ====================
const rotasAutenticacao = require('./routes/autenticacao');
const rotasPresenca = require('./routes/presenca');
const rotasAvaliacao = require('./routes/avaliacao');
const rotasConteudo = require('./routes/conteudo');
const rotasPainel = require('./routes/painel');
const rotasUsuarios = require('./routes/usuarios');
const rotasNotificacoes = require('./routes/notificacoes');
const rotasTurmas = require('./routes/turmas');
const rotasRelatorios = require('./routes/relatorios');
const rotasHistorico = require('./routes/historico');
const rotasDocumentos = require('./routes/documentos');
const rotasPromocao = require('./routes/promocao');
const rotasDisciplinas = require('./routes/disciplinas');
const rotasHorarios = require('./routes/horarios');

app.use('/api/auth', rotasAutenticacao);
app.use('/api/presenca', rotasPresenca);
app.use('/api/avaliacao', rotasAvaliacao);
app.use('/api/conteudo', rotasConteudo);
app.use('/api/painel', rotasPainel);
app.use('/api/usuarios', rotasUsuarios);
app.use('/api/notificacoes', rotasNotificacoes);
app.use('/api/turmas', rotasTurmas);
app.use('/api/relatorios', rotasRelatorios);
app.use('/api/historico', rotasHistorico);
app.use('/api/documentos', rotasDocumentos);
app.use('/api/promocao', rotasPromocao);
app.use('/api/disciplinas', rotasDisciplinas);
app.use('/api/horarios', rotasHorarios);

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

// ==================== FRONTEND ESTÁTICO ====================
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// ==================== 404 ====================
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      sucesso: false,
      mensagem: 'Rota não encontrada'
    });
  }

  res.status(404).sendFile(path.join(frontendPath, 'index.html'));
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    sucesso: false,
    mensagem: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor'
      : err.message
  });
});

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n🚀 Servidor iniciado');
  console.log(`📌 Porta: ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 http://localhost:${PORT}\n`);
});