FROM ubuntu:24.04 AS mupdf-builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y \
    git \
    build-essential \
    pkg-config \
    libfreetype6-dev \
    libjpeg-dev \
    libopenjp2-7-dev \
    libjbig2dec0-dev \
    libgumbo-dev \
    libharfbuzz-dev \
    libmujs-dev \
    && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone --depth 1 --recursive https://github.com/ArtifexSoftware/mupdf.git

WORKDIR /build/mupdf

RUN make HAVE_X11=no HAVE_GLUT=no tools

RUN mkdir -p /mupdf-bin && \
    cp build/release/mutool /mupdf-bin/mutool


FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y \
    nodejs \
    npm \
    libfreetype6 \
    libjpeg8 \
    libopenjp2-7 \
    libjbig2dec0 \
    libgumbo1 \
    libharfbuzz0b \
    && \
    rm -rf /var/lib/apt/lists/*

COPY --from=mupdf-builder /mupdf-bin/mutool /usr/local/bin/mutool

RUN chmod +x /usr/local/bin/mutool && \
    mutool -v

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY server.js ./
COPY pdf-compressor.html ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]