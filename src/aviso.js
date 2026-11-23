// Aviso para a equipe: quando a Júlia marca reunião, manda o briefing do lead no WhatsApp de quem vai conduzir
import { enviarTexto } from './whatsapp/uazapi.js';

const DESTINO = () => process.env.AVISO_TELEFONE;

// Definição da ferramenta que a Júlia enxerga
export const FERRAMENTA_AVISO = {
  name: 'avisar_reuniao_marcada',
  description:
    'Avisa a equipe pelo WhatsApp que uma reunião foi marcada. Use UMA vez, logo depois que a agenda confirmar o agendamento. ' +
    'Escreva como briefing para quem vai conduzir a reunião, com as palavras do lead. O lead não vê esta mensagem.',
  input_schema: {
    type: 'object',
    properties: {
      nome: { type: 'string', description: 'Nome completo do lead' },
      empresa: { type: 'string' },
      email: { type: 'string' },
      data_hora: { type: 'string', description: 'Dia e horário exatamente como a agenda confirmou' },
      problema: { type: 'string', description: 'A dor do lead: o que trava, o que faz na mão, o que isso custa' },
      orcamento: { type: 'string', description: 'Quanto ele planeja investir' },
      urgencia: { type: 'string', description: 'Prazo e o que acontece se não resolver' },
      decisor: { type: 'string', description: 'Quem decide e quem vai estar na reunião' },
      observacoes: { type: 'string', description: 'Objeções, perfil, o que chamou atenção, o que evitar na reunião' },
    },
    required: ['nome', 'empresa', 'data_hora', 'problema', 'orcamento'],
  },
};

// Monta o texto do briefing (negrito do WhatsApp é um asterisco)
export function montarAviso(d, telefoneLead) {
  return [
    '📅 *Reunião marcada pela Júlia*',
    '',
    `*Quando:* ${d.data_hora}`,
    `*Lead:* ${d.nome} — ${d.empresa}`,
    `*WhatsApp:* ${telefoneLead}`,
    `*E-mail:* ${d.email || 'não informado'}`,
    '',
    `*Problema:* ${d.problema}`,
    `*Orçamento:* ${d.orcamento}`,
    `*Urgência:* ${d.urgencia || 'não informada'}`,
    `*Decisor:* ${d.decisor || 'não informado'}`,
    '',
    `*Observações:* ${d.observacoes || '—'}`,
  ].join('\n');
}

// Executa a ferramenta: envia e devolve o resultado para a Júlia
export async function avisarReuniao(dados, telefoneLead) {
  await enviarTexto(DESTINO(), montarAviso(dados, telefoneLead));
  console.log(`[aviso] reunião do lead ...${String(telefoneLead).slice(-4)} enviada à equipe`);
  return 'Equipe avisada.';
}
