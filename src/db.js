// Banco SQLite: guarda quem fala com a Júlia e o histórico de cada conversa
import Database from 'better-sqlite3';

// Abre (ou cria na primeira vez) o arquivo do banco
const db = new Database(process.env.DB_PATH || 'agente.db');
db.pragma('journal_mode = WAL'); // lê e escreve ao mesmo tempo sem travar

// Tabelas: contatos (quem manda) e mensagens (o histórico, por telefone)
db.exec(`
  CREATE TABLE IF NOT EXISTS contatos (
    telefone  TEXT PRIMARY KEY,                -- WhatsApp do lead: é para ele que a resposta volta
    nome      TEXT,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mensagens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    whatsapp_id TEXT UNIQUE,                   -- id da UAZAPI: impede processar a mesma mensagem 2x
    telefone    TEXT NOT NULL REFERENCES contatos(telefone),
    papel       TEXT NOT NULL CHECK (papel IN ('user', 'assistant')),
    texto       TEXT NOT NULL,
    criado_em   TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_mensagens_telefone ON mensagens (telefone, id);
`);

// Salva o contato; se já existe, só atualiza o nome
export function salvarContato(telefone, nome) {
  db.prepare(`
    INSERT INTO contatos (telefone, nome) VALUES (?, ?)
    ON CONFLICT (telefone) DO UPDATE SET nome = COALESCE(excluded.nome, contatos.nome)
  `).run(telefone, nome ?? null);
}

// Busca o contato pelo telefone: a Júlia usa o nome para chamar o lead
export function buscarContato(telefone) {
  return db.prepare(`SELECT telefone, nome FROM contatos WHERE telefone = ?`).get(telefone);
}

// Salva uma mensagem; devolve false se o whatsapp_id já existia (webhook repetido)
export function salvarMensagem({ whatsappId = null, telefone, papel, texto }) {
  const r = db.prepare(`
    INSERT OR IGNORE INTO mensagens (whatsapp_id, telefone, papel, texto) VALUES (?, ?, ?, ?)
  `).run(whatsappId, telefone, papel, texto);
  return r.changes > 0;
}

// Últimas N mensagens do contato, da mais antiga para a mais nova, no formato do Claude
export function historico(telefone, limite = 20) {
  const linhas = db.prepare(`
    SELECT papel, texto FROM mensagens WHERE telefone = ? ORDER BY id DESC LIMIT ?
  `).all(telefone, limite).reverse();

  // O Claude exige que a conversa comece por uma mensagem do usuário
  while (linhas.length && linhas[0].papel !== 'user') linhas.shift();

  // Mensagens seguidas do mesmo lado viram uma só (o lead manda 3 mensagens, o Claude lê como 1)
  const conversa = [];
  for (const l of linhas) {
    const ultima = conversa[conversa.length - 1];
    if (ultima && ultima.role === l.papel) ultima.content += `\n${l.texto}`;
    else conversa.push({ role: l.papel, content: l.texto });
  }
  return conversa;
}
