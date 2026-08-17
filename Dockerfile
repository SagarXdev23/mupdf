FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y \
    nodejs \
    npm \
    mupdf-tools \
    && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY server.js ./
COPY pdf-compressor.html ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]