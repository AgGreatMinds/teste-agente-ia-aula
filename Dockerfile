# Imagem da Júlia: Node 20 enxuto
FROM node:20-slim

WORKDIR /app

# Instala só as dependências de produção (camada em cache enquanto o package.json não muda)
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o código e o prompt
COPY src ./src
COPY prompt.md ./

# Banco SQLite fica num volume, para não sumir quando o container é recriado
ENV DB_PATH=/app/data/agente.db
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
# As variáveis vêm do --env-file do docker, por isso não usa o "npm start"
CMD ["node", "src/server.js"]
