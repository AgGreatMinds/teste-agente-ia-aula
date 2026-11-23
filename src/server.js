// Servidor: recebe o WhatsApp, chama a Júlia, devolve a resposta
import express from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import * as db from './db.js';
import { responder } from './agent.js';
import * as uazapi from './whatsapp/uazapi.js';

const PROVEDORES = { uazapi };
const app = express();
app.use(express.json({ limit: '1mb' }));

// Compara o segredo em tempo constante (não dá para adivinhar letra por letra)
function segredoOk(recebido) {
  const a = Buffer.from(String(recebido ?? ''));
  const b = Buffer.from(process.env.WEBHOOK_SECRET ?? '');
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Log só com os 4 últimos dígitos do telefone (a aula é gravada)
const final4 = (telefone) => `...${String(telefone).slice(-4)}`;

// Fluxo de uma mensagem: salva → histórico → Júlia → salva a resposta
async function conversar({ id, telefone, nome, texto }) {
  db.salvarContato(telefone, nome);
  if (!db.salvarMensagem({ whatsappId: id, telefone, papel: 'user', texto })) return null; // já processada

  const resposta = await responder(db.historico(telefone, 20), db.buscarContato(telefone));
  if (!resposta) return null;

  db.salvarMensagem({ telefone, papel: 'assistant', texto: resposta });
  return resposta;
}

// Agrupamento: espera o lead parar de digitar antes de responder (uma resposta para várias mensagens)
const ESPERA_MS = Number(process.env.AGRUPAR_MS) || 8000;
const filas = new Map(); // telefone -> { timer, rodando, pendente, provedor }

// Cada mensagem nova reinicia o relógio de espera daquele lead
function agendarResposta(telefone, provedor) {
  const f = filas.get(telefone) || {};
  clearTimeout(f.timer);
  f.provedor = provedor;
  filas.set(telefone, f);

  // Se a Júlia já está respondendo, só marca que chegou mais coisa
  if (f.rodando) { f.pendente = true; return; }
  f.timer = setTimeout(() => responderAgora(telefone), ESPERA_MS);
}

// Silêncio de ESPERA_MS: lê o histórico inteiro (com todas as mensagens novas) e responde uma vez
async function responderAgora(telefone) {
  const f = filas.get(telefone);
  f.rodando = true;
  f.pendente = false;
  try {
    const resposta = await responder(db.historico(telefone, 20), db.buscarContato(telefone));

    // Chegou mensagem enquanto ela pensava: descarta esta resposta e responde tudo junto na próxima rodada
    if (f.pendente || !resposta) return;

    db.salvarMensagem({ telefone, papel: 'assistant', texto: resposta });
    // Assinatura no WhatsApp: "Júlia: ..." (só no envio; o histórico fica sem, para o Claude não copiar)
    await f.provedor.enviarTexto(telefone, `Júlia: ${resposta}`);
    console.log(`[whatsapp] ${final4(telefone)} respondido`);
  } catch (e) {
    console.error(`[whatsapp] ${final4(telefone)} erro: ${e.message}`);
  } finally {
    f.rodando = false;
    if (f.pendente) agendarResposta(telefone, f.provedor);
    else filas.delete(telefone);
  }
}

// Webhook do WhatsApp: segredo errado = 404, responde 200 na hora, salva e agenda a resposta
app.post('/webhook/:provedor/:segredo', (req, res) => {
  const provedor = PROVEDORES[req.params.provedor];
  if (!provedor || !segredoOk(req.params.segredo)) return res.sendStatus(404);
  res.sendStatus(200);

  const msg = provedor.lerMensagem(req.body);
  if (!msg) return;

  try {
    db.salvarContato(msg.telefone, msg.nome);
    // Mensagem repetida (UAZAPI reenviou) não reinicia nada
    if (!db.salvarMensagem({ whatsappId: msg.id, telefone: msg.telefone, papel: 'user', texto: msg.texto })) return;
    agendarResposta(msg.telefone, provedor);
  } catch (e) {
    console.error(`[${req.params.provedor}] ${final4(msg.telefone)} erro ao salvar: ${e.message}`);
  }
});

// Conversar com a Júlia pelo curl, sem WhatsApp
const Teste = z.object({ telefone: z.string().min(8).max(20), texto: z.string().min(1).max(4000) });

app.post('/teste', async (req, res) => {
  if (!segredoOk(req.get('x-segredo'))) return res.sendStatus(404);
  const r = Teste.safeParse(req.body);
  if (!r.success) return res.status(400).json({ erro: 'Envie { telefone, texto }' });

  try {
    res.json({ resposta: await conversar({ id: null, nome: null, ...r.data }) });
  } catch (e) {
    console.error(`[teste] ${final4(r.data.telefone)} erro: ${e.message}`);
    res.status(500).json({ erro: 'Falha ao responder' });
  }
});

// Saúde do servidor
app.get('/health', (_req, res) => res.json({ ok: true }));

const porta = Number(process.env.PORT) || 3000;
app.listen(porta, () => console.log(`Júlia no ar na porta ${porta}`));
