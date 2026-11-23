// Data e hora sempre no fuso de São Paulo
const FUSO = 'America/Sao_Paulo';

// "domingo, 23 de novembro de 2026 às 15:30": vai no contexto dos agentes
export const agora = () =>
  new Date().toLocaleString('pt-BR', { timeZone: FUSO, dateStyle: 'full', timeStyle: 'short' });

// "terça-feira, 25/11, 14:00": como o horário aparece para a Júlia
export const rotulo = (iso) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: FUSO, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
