// UAZAPI: lê a mensagem que chega no webhook e envia a resposta
import { z } from 'zod';

// Formato do webhook de mensagem da UAZAPI (só o que usamos)
const Webhook = z.object({
  EventType: z.literal('messages'),
  message: z.object({
    messageid: z.string(),
    chatid: z.string(),
    text: z.string().nullish(),
    fromMe: z.boolean().nullish(),
    isGroup: z.boolean().nullish(),
    wasSentByApi: z.boolean().nullish(),
    senderName: z.string().nullish(),
  }),
});

// Devolve { id, telefone, nome, texto } ou null se for para ignorar
export function lerMensagem(body) {
  const r = Webhook.safeParse(body);
  if (!r.success) return null;
  const m = r.data.message;

  // Ignora o que nós mesmos mandamos e mensagem de grupo
  if (m.fromMe || m.wasSentByApi || m.isGroup || m.chatid.endsWith('@g.us')) return null;

  // Só texto (áudio, imagem etc. ficam de fora)
  const texto = m.text?.trim();
  if (!texto) return null;

  return { id: m.messageid, telefone: m.chatid.split('@')[0], nome: m.senderName || null, texto };
}

// Envia texto para o lead pela UAZAPI
export async function enviarTexto(telefone, texto) {
  const r = await fetch(`${process.env.UAZAPI_URL}/send/text`, {
    method: 'POST',
    headers: { token: process.env.UAZAPI_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: telefone, text: texto }),
  });
  if (!r.ok) throw new Error(`UAZAPI respondeu ${r.status}`);
}
