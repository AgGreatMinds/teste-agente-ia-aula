# Júlia — agente comercial de IA no WhatsApp

Agente que atende leads de tráfego pago (Instagram/Facebook) pelo WhatsApp como uma pessoa:
qualifica (problema, decisor, urgência, orçamento), contorna objeções e **marca reunião na agenda**.
Quando marca, manda um briefing do lead para o WhatsApp da equipe.

Feito ao vivo na mentoria de IA da GreatMinds. Use, copie e adapte à vontade (licença MIT).

## Como funciona

```
WhatsApp (UAZAPI) → POST /webhook → SQLite (histórico) → Júlia (Claude) → resposta no WhatsApp
                                                           ├─ ferramenta agenda → subagente de agenda (consulta, marca, cancela)
                                                           └─ ferramenta avisar_reuniao_marcada → briefing para a equipe
```

- **Agrupa mensagens:** o lead manda 3 mensagens seguidas, a Júlia responde uma vez só (`AGRUPAR_MS`, padrão 8 s).
- **Subagente de agenda:** modelo menor, sem memória, devolve no máximo 3 horários e só marca com 24 h de antecedência (regra no código, não no prompt).
- **Prompt editável a quente:** `prompt.md` é lido a cada mensagem; mude o texto sem reiniciar.
- **Sem duplicar:** o id da mensagem do WhatsApp é único no banco; reenvio do provedor é ignorado.

## Stack

Node 20+ (ES modules) · Express · SQLite (`better-sqlite3`) · `@anthropic-ai/sdk` · `zod` · UAZAPI.
Sem front-end, sem fila, sem Docker obrigatório.

## Rodar

```bash
npm install
cp .env.example .env   # preencha as chaves
npm start
```

Conversar sem WhatsApp:

```bash
curl -s -X POST localhost:3000/teste \
  -H "x-segredo: SEU_WEBHOOK_SECRET" -H 'content-type: application/json' \
  -d '{"telefone":"5511999999999","texto":"Oi, vi o anúncio"}'
```

## Variáveis (`.env`)

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da API da Anthropic |
| `MODEL` / `MODEL_AGENDA` | Modelo da Júlia e do subagente de agenda |
| `WEBHOOK_SECRET` | Segredo na URL do webhook (gere com `openssl rand -hex 16`) |
| `UAZAPI_URL` / `UAZAPI_TOKEN` | Instância do WhatsApp na UAZAPI |
| `GREATMINDS_*` | API de agenda (veja "Trocar a agenda") |
| `AVISO_TELEFONE` | WhatsApp que recebe o briefing da reunião (vazio = desligado) |
| `AGRUPAR_MS` | Espera antes de responder, em ms (padrão 8000) |

## Ligar o WhatsApp (UAZAPI)

```bash
curl -X POST "$UAZAPI_URL/webhook" -H "token: $UAZAPI_TOKEN" -H 'content-type: application/json' \
  -d '{"enabled":true,"url":"https://SEU_DOMINIO/webhook/uazapi/SEU_WEBHOOK_SECRET","events":["messages"],"excludeMessages":["wasSentByApi"]}'
```

## Subir com Docker

O `Dockerfile` já está pronto (porta 3000, banco em `/app/data`). Monte um volume em `/app/data`
para não perder o histórico a cada deploy.

## Adaptar para o seu negócio

| Arquivo | O que mudar |
|---|---|
| `prompt.md` | Quem é a agente, o que você vende, qualificação, preço, objeções, tom |
| `src/greatminds.js` | Cliente da API de agenda. Troque pela sua (Google Calendar, Cal.com...) mantendo as 4 funções: `horariosLivres`, `criarAgendamento`, `agendamentosDoLead`, `cancelarAgendamento` |
| `src/agenda.js` | Regras da agenda: antecedência mínima e quantos horários oferecer |
| `src/aviso.js` | Formato do briefing que a equipe recebe |

## Estrutura

```
prompt.md                 system prompt da Júlia
src/server.js             webhook, agrupamento de mensagens, /teste, /health
src/agent.js              Júlia: loop de ferramentas com o Claude
src/agenda.js             subagente de agenda
src/greatminds.js         cliente da API de agenda
src/aviso.js              briefing da reunião para a equipe
src/db.js                 SQLite: contatos e mensagens
src/hora.js               data e hora em Brasília
src/whatsapp/uazapi.js    lê o webhook e envia texto
```

## Licença

MIT
