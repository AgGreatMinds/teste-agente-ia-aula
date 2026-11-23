// Cliente da API externa do GreatMinds (agenda do Matheus) — mesma API que o Empresário IA usa em produção
const BASE = () => String(process.env.GREATMINDS_URL).replace(/\/$/, '');
const AGENDA = () => process.env.GREATMINDS_AGENDA_ID;
const TIPO = () => process.env.GREATMINDS_APPOINTMENT_TYPE_ID; // tipo "reunião" (define a duração)

// A API responde sempre 200: quem diz se deu certo é body.success
async function chamar(metodo, caminho, corpo) {
  const r = await fetch(`${BASE()}/api/external${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${process.env.GREATMINDS_API_KEY}`, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(15000), // não deixa a Júlia travada esperando
  });
  if (!r.ok) throw new Error(`GreatMinds respondeu ${r.status} em ${metodo} ${caminho.split('?')[0]}`);
  const body = await r.json();
  if (body?.success !== true) {
    if (body?.error?.http_status === 409) throw new Error('Esse horário acabou de ser ocupado. Busque outro.');
    throw new Error(body?.error?.message || 'Erro desconhecido da agenda');
  }
  return body.data;
}

// A API lê o horário como hora de Brasília sem fuso: converte o instante para "YYYY-MM-DDTHH:MM:SS" de Brasília
function horaBrasilia(iso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}

// Horários livres entre duas datas (YYYY-MM-DD) → lista de inícios em ISO com fuso de Brasília
export async function horariosLivres(inicio, fim) {
  const qs = new URLSearchParams({ agenda_id: AGENDA(), appointment_type_id: TIPO(), date_from: inicio, date_to: fim });
  const dados = await chamar('GET', `/agenda/slots?${qs}`);

  // Vem como { "terça-feira 25/11/2026": ["14:00", "15:00"] }
  return Object.entries(dados?.available_days || {}).flatMap(([dia, horas]) => {
    const [d, m, a] = dia.split(' ').pop().split('/');
    return horas.map((h) => `${a}-${m}-${d}T${h}:00-03:00`);
  }).sort();
}

// Cria a reunião. O GreatMinds convida o e-mail no Google Agenda e gera o link do Meet
export async function criarAgendamento({ inicio, nome, email, empresa, telefone }) {
  const dados = await chamar('POST', '/appointments', {
    agenda_id: AGENDA(),
    appointment_type_id: TIPO(),
    start_datetime: horaBrasilia(inicio),
    contact_name: nome,
    contact_phone: telefone,
    contact_email: email,
    notes: `Empresa: ${empresa} — agendado pela Júlia (WhatsApp)`,
  });
  return { id: dados?.id, inicio, meet_link: dados?.meet_link ?? null };
}

// Reuniões dos próximos 60 dias desse lead (a API não filtra por telefone, então filtramos aqui)
export async function agendamentosDoLead(telefone) {
  const hoje = new Date();
  const ate = new Date(hoje.getTime() + 60 * 24 * 60 * 60 * 1000);
  const qs = new URLSearchParams({
    agenda_id: AGENDA(), date_from: hoje.toISOString().slice(0, 10), date_to: ate.toISOString().slice(0, 10), limit: '100',
  });
  const dados = await chamar('GET', `/appointments?${qs}`);

  // Compara os 8 últimos dígitos (evita problema com o 9º dígito e o 55)
  const final = String(telefone).replace(/\D/g, '').slice(-8);
  return (dados?.appointments || [])
    .filter((a) => String(a.contact_phone || '').replace(/\D/g, '').endsWith(final))
    .map((a) => ({ id: a.id, inicio: a.start_datetime, status: a.status }));
}

// Cancela uma reunião pelo id
export const cancelarAgendamento = (id) =>
  chamar('POST', '/appointments/cancel', { id, reason: 'Cancelado pelo lead pelo WhatsApp (Júlia)' });
