// ==========================================================================
// CARREGAMENTO DAS VARIÁVEIS DE AMBIENTE E CAMINHOS DO SISTEMA
// --------------------------------------------------------------------------
// Ordem de prioridade (a primeira definição de cada variável prevalece):
//   1. Variáveis já definidas no processo (ex.: serviço do Windows)
//   2. Arquivo indicado em NEXGUSTO_CONFIG (instalação: ProgramData\NexGusto\config\.env)
//   3. backend/.env e .env da raiz do projeto (desenvolvimento)
// ==========================================================================
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');

const backendDir = path.resolve(__dirname, '../..');

if (process.env.NEXGUSTO_CONFIG) {
    dotenv.config({ path: process.env.NEXGUSTO_CONFIG, quiet: true });
}
dotenv.config({ path: path.join(backendDir, '.env'), quiet: true });
dotenv.config({ path: path.resolve(backendDir, '../.env'), quiet: true });

// Pasta de dados gravável (fotos, marcadores de licença). Em desenvolvimento
// continua usando a pasta backend/, como antes.
const dataDir = process.env.NEXGUSTO_DATA_DIR
    ? path.resolve(process.env.NEXGUSTO_DATA_DIR)
    : backendDir;

const programData = process.env.ProgramData || process.env.PROGRAMDATA ||
    (process.platform === 'win32' ? 'C:\ProgramData' : path.join(os.homedir(), '.local', 'share'));

module.exports = {
    backendDir,
    dataDir,
    uploadsDir: path.join(dataDir, 'uploads'),
    // Locais dos marcadores do período de teste (mantidos mesmo após desinstalar)
    marcadoresLicenca: [
        path.join(programData, 'NexGusto', 'licenca', 'sistema.dat'),
        path.join(os.homedir(), '.nexgusto', 'estado.dat')
    ]
};
