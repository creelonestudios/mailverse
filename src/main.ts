import POP3Server from "./pop3/POP3Server.js"
import SMTPServer from "./smtp/SMTPServer.js"
import { Sequelize } from 'sequelize-typescript';
import User from "./models/User.js";
import Mail from "./models/Mail.js";
import getConfig from "./config.js";

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

export const smtpserver = new SMTPServer(getConfig("smtp_port", 25)) // Port 25 for regular SMTP, 465 for SMTPS
const pop3server = getConfig("enable_pop3", true) ? new POP3Server(getConfig("pop3_port", 110), false) : null // Port 110 for regular POP3, 995 for POP3S
const pop3sserver = getConfig("enable_pop3s", false) ? new POP3Server(getConfig("pop3s_port", 995), true) : null // Port 110 for regular POP3, 995 for POP3S
