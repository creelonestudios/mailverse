FROM node

WORKDIR /app

COPY package.json /app

RUN npm install

COPY . /app

# SMTP, SMTPS, POP3, POP3S
EXPOSE 25 465 110 995

VOLUME ["/app/mails", "/app/config.json"]

CMD ["node", "."]