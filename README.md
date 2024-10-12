![mailverse](logo.png)
# Mailverse

> [!WARNING]
> This project is still in development.

Mailverse is a new and modern email server written in TypeScript. It is designed to be fast, secure and easy to use.

## Features

- **[SMTP]** **[POP3]** **[IMAP]** server with TLS support
- 🆕 **Upstreams**: use an existing SMTP / POP server as relay and store your mail on own hardware.
Unique to Mailverse
- 🔜 **Web Interface** for managing your instance
- 🔜 **Webmailer** with modern UI
- **Redis** support for storing mail
- 🔜 **Docker** support

## Installation

### 🔜 Docker Compose

```yml
version: "3"
services:
  mailverse:
    image: mailverse/mailverse
    ports:
      - "25:25"
      - "110:110"
      - "465:465"
      - "995:995"
    volumes:
      - ./mails:/app/mails
      - ./config.json:/app/config.json
  db:
    image: mariadb
    environment:
      - MYSQL_ROOT_PASSWORD=mailverse
      - MYSQL_DATABASE=mailverse
      - MYSQL_USER=mailverse
      - MYSQL_PASSWORD=mailverse
```

### Manual

1. Install the latest version of NodeJS
2. Clone the repository
3. Run `npm install`
4. Run `npm run build` (or `tsc`)
5. Set up a MariaDB / MySQL database and create a user with access to it
6. Create a `config.json` file (see below)
7. Run `node .` (may require root permissions) or with a process manager like `pm2`

## Config

Copy the example config from `config.sample.json` to `config.json` and adjust it to your needs.

In case of using Docker: you should only change the ports in the config if you are using host networking. If not, change the ports in the port mapping instead.
