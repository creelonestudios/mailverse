import POP3Server from "./pop3/POP3Server.js"
import SMTPServer from "./smtp/SMTPServer.js"
import { Sequelize } from 'sequelize-typescript';
import User from "./models/User.js";
import Mail from "./models/Mail.js";
import getConfig from "./config.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

export const sql = new Sequelize({
  database: getConfig("db_database"),
  dialect: getConfig("db_dialect"),
  username: getConfig("db_username"),
  password: getConfig("db_password"),
  models: [User, Mail]
});

// await sql.sync({ alter: true })

// await User.create({
// 	name: "Cfp",
// 	username: "cfp",
// 	password: "1234"
// })

if(getConfig("tls_key")) {
  if(!existsSync(getConfig("tls_key", "cert/privkey.pem"))) {
    console.error("TLS key not found")
  }
}
if(getConfig("tls_cert")) {
  if(!existsSync(getConfig("tls_cert", "cert/fullchain.pem"))) {
    console.error("TLS certificate not found")
  }
}

const tlsKey = existsSync(getConfig("tls_key", "cert/privkey.pem")) ? await readFile(getConfig("tls_key", "cert/privkey.pem")) : null
const tlsCert = existsSync(getConfig("tls_cert", "cert/fullchain.pem")) ? await readFile(getConfig("tls_cert", "cert/fullchain.pem")) : null

export const smtpserver = new SMTPServer(getConfig("smtp_port", 25)) // Port 25 for regular SMTP, 465 for SMTPS
if(getConfig("enable_pop3", true)) new POP3Server(getConfig("pop3_port", 110), false) // Port 110 for regular POP3, 995 for POP3S
if(getConfig("enable_pop3s", false) && tlsKey && tlsCert) new POP3Server(getConfig("pop3s_port", 995), true, tlsKey, tlsCert) // Port 110 for regular POP3, 995 for POP3S
