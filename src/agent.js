// Júlia: a agente comercial. Conversa com o lead e pede tudo de agenda ao subagente
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { agenda } from './agenda.js';
import { agora } from './hora.js';
import { FERRAMENTA_AVISO, avisarReuniao } from './aviso.js';

const claude = new Anthropic(); // lê ANTHROPIC_API_KEY do .env
const PROMPT = new URL('../prompt.md', import.meta.url);

// Ferramentas da Júlia: o subagente de agenda e o aviso de reunião para a equipe
const FERRAMENTAS = [
  FERRAMENTA_AVISO,
  {
    name: 'agenda',
    description:
      'Assistente da agenda do Matheus. Use para ver horários livres, marcar, consultar ou cancelar reuniões. ' +
      'Escreva o pedido completo em texto: o que fazer, o dia ou período que o lead prefere e, para marcar, ' +
      'o horário escolhido, nome completo, e-mail, empresa e telefone do lead.',
    input_schema: { type: 'object', properties: { pedido: { type: 'string' } }, required: ['pedido'] },
  },
];

// Recebe o histórico do banco e o contato; devolve o texto que vai para o WhatsApp
export async function responder(historico, contato) {
  // prompt.md é lido a cada mensagem: dá para editar sem reiniciar o servidor
  const system = `${readFileSync(PROMPT, 'utf8')}

## Contexto desta conversa
- Agora: ${agora()}
- Nome do lead (perfil do WhatsApp): ${contato?.nome || 'não informado'}
- WhatsApp do lead: ${contato?.telefone}`;

  const mensagens = [...historico];

  for (let volta = 0; volta < 5; volta++) {
    const r = await claude.messages.create({
      model: process.env.MODEL || 'claude-sonnet-5-5',
      max_tokens: 1024,
      system,
      tools: FERRAMENTAS,
      output_config: { effort: 'low' },
      messages: mensagens,
    });

    // Resposta pronta para o lead
    if (r.stop_reason !== 'tool_use') return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

    // Chamou ferramenta: executa e devolve só o resultado (isso não vai para o banco)
    mensagens.push({ role: 'assistant', content: r.content });
    const resultados = [];
    for (const b of r.content.filter((b) => b.type === 'tool_use')) {
      try {
        const saida = b.name === 'avisar_reuniao_marcada'
          ? await avisarReuniao(b.input, contato?.telefone)
          : await agenda(b.input.pedido);
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: saida });
      } catch (e) {
        // Falha na ferramenta não derruba a conversa com o lead
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: `Falhou: ${e.message}`, is_error: true });
      }
    }
    mensagens.push({ role: 'user', content: resultados });
  }
  throw new Error('A Júlia passou do limite de chamadas à agenda');
}
