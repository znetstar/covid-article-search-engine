FROM ubuntu:20.04

ENV DEBIAN_FRONTEND noninteractive

ENV APT_MIRROR "us-east-1.ec2.archive.ubuntu.com"

RUN sed -i -e "s/archive.ubuntu.com/$APT_MIRROR/g" /etc/apt/sources.list && \
    apt-get update -y && \
    apt-get install  -y curl sudo && \
    bash -c 'curl -fsSL https://deb.nodesource.com/setup_14.x | bash' && \
    apt-get update -y && \
    apt-get install -o Dpkg::Options::="--force-confold"  -y build-essential \
      python3 \
      nodejs && \
    apt-get clean -y && \
    rm -rf /var/lib/apt/lists/*

ENV PORT 80

EXPOSE $PORT

WORKDIR /app

ADD ./package.json /app/package.json

ADD ./package-lock.json /app/package-lock.json

RUN ln -sv /usr/bin/python3 /usr/bin/python || true && npm install -g typescript && \
    npm ci

ADD . /app

RUN npx next build

CMD npx next start
