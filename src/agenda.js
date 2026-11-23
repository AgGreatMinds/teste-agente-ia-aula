// Subagente de agenda: só a Júlia fala com ele, não tem memória, cuida de todas as ferramentas da agenda
import Anthropic from '@anthropic-ai/sdk';
import * as gm from './greatminds.js';
import { agora, rotulo } from './hora.js';

const claude = new Anthropic(); // lê ANTHROPIC_API_KEY do .env
const ANTECEDENCIA_MS = 24 * 60 * 60 * 1000; // regra do Matheus: no mínimo 24h antes
const MAX_HORARIOS = 3; // nunca mostrar mais que 3, para a agenda não parecer vazia

const prompt = () => `Você é o assistente de agenda do Matheus. Quem fala com você é a Júlia, consultora comercial. Você nunca fala com o lead.
Agora: ${agora()} (fuso de São Paulo).

- Faça só o que a Júlia pediu, usando as ferramentas. Nunca invente horário nem agendamento.
- Transforme "terça", "amanhã de manhã", "semana que vem" em datas reais a partir de agora.
- Se o lead quer um período (manhã, tarde), devolva só horários desse período.
- Devolva no máximo 3 horários, usando o rótulo que a ferramenta trouxe.
- Para marcar, você precisa de: horário, nome, e-mail, empresa e telefone. Faltou algum? Diga qual e não marque.
- Responda curto, só o resultado, para a Júlia repassar.`;

// Ferramentas que só este subagente enxerga
const FERRAMENTAS = [
  {
    name: 'horarios_livres',
    description: 'Horários livres de 1h na agenda do Matheus entre duas datas. Já remove o que está a menos de 24h e devolve no máximo 3.',
    input_schema: {
      type: 'object',
      properties: {
        data_inicio: { type: 'string', description: 'YYYY-MM-DD' },
        data_fim: { type: 'string', description: 'YYYY-MM-DD (igual à data_inicio para um dia só)' },
        periodo: { type: 'string', enum: ['manha', 'tarde', 'qualquer'] },
      },
      required: ['data_inicio', 'data_fim'],
    },
  },
  {
    name: 'marcar_reuniao',
    description: 'Marca a reunião de 1h no Meet com o Matheus.',
    input_schema: {
      type: 'object',
      properties: {
        inicio: { type: 'string', description: 'ISO com fuso, exatamente como veio de horarios_livres' },
        nome: { type: 'string' }, email: { type: 'string' }, empresa: { type: 'string' }, telefone: { type: 'string' },
      },
      required: ['inicio', 'nome', 'email', 'empresa', 'telefone'],
    },
  },
  {
    name: 'reunioes_do_lead',
    description: 'Lista as reuniões futuras do lead pelo telefone.',
    input_schema: { type: 'object', properties: { telefone: { type: 'string' } }, required: ['telefone'] },
  },
  {
    name: 'cancelar_reuniao',
    description: 'Cancela uma reunião pelo id (pegue o id em reunioes_do_lead).',
    input_schema: { type: 'object', properties: { agendamento_id: { type: 'string' } }, required: ['agendamento_id'] },
  },
];

// Pega N horários espalhados na lista (manhã e tarde), em vez dos N primeiros
function espalhar(lista, n) {
  if (lista.length <= n) return lista;
  const passo = lista.length / n;
  return Array.from({ length: n }, (_, i) => lista[Math.floor(i * passo)]);
}

// Hora (0-23) em São Paulo, para filtrar manhã/tarde
const horaSP = (iso) => Number(new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));

// Executa a ferramenta pedida; as regras de negócio ficam no código, não na boa vontade do modelo
async function executar(nome, input) {
  switch (nome) {
    case 'horarios_livres': {
      let livres = (await gm.horariosLivres(input.data_inicio, input.data_fim))
        .filter((iso) => new Date(iso) - Date.now() >= ANTECEDENCIA_MS);
      if (input.periodo === 'manha') livres = livres.filter((iso) => horaSP(iso) < 12);
      if (input.periodo === 'tarde') livres = livres.filter((iso) => horaSP(iso) >= 12);
      return espalhar(livres, MAX_HORARIOS).map((iso) => ({ inicio: iso, rotulo: rotulo(iso) }));
    }
    case 'marcar_reuniao':
      if (new Date(input.inicio) - Date.now() < ANTECEDENCIA_MS) return { erro: 'Horário com menos de 24h de antecedência.' };
      return gm.criarAgendamento(input);
    case 'reunioes_do_lead':
      return gm.agendamentosDoLead(input.telefone);
    case 'cancelar_reuniao':
      return gm.cancelarAgendamento(input.agendamento_id);
    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}

// Recebe o pedido da Júlia em texto e devolve o resultado em texto. Cada chamada começa do zero.
export async function agenda(pedido) {
  const mensagens = [{ role: 'user', content: pedido }];

  for (let volta = 0; volta < 6; volta++) {
    const r = await claude.messages.create({
      model: process.env.MODEL_AGENDA || 'claude-haiku-5-5',
      max_tokens: 1024,
      system: prompt(),
      tools: FERRAMENTAS,
      messages: mensagens,
    });

    // Terminou: devolve só o texto final para a Júlia
    if (r.stop_reason !== 'tool_use') return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

    // Pediu ferramenta: executa e devolve o resultado para ele continuar
    mensagens.push({ role: 'assistant', content: r.content });
    const resultados = [];
    for (const b of r.content.filter((b) => b.type === 'tool_use')) {
      try {
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(await executar(b.name, b.input)) });
      } catch (e) {
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: e.message, is_error: true });
      }
    }
    mensagens.push({ role: 'user', content: resultados });
  }
  return 'Não consegui concluir na agenda agora. Tente de novo em instantes.';
}
