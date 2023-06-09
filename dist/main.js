import POP3Server from "./pop3/POP3Server.js";
import SMTPServer from "./smtp/SMTPServer.js";
import { Sequelize } from 'sequelize-typescript';
import User from "./models/User.js";
import Mail from "./models/Mail.js";
import getConfig from "./config.js";
import { readFile } from "node:fs/promises";
global.debug = getConfig("debug", false);
export const sql = new Sequelize({
    database: getConfig("db.database"),
    dialect: getConfig("db.dialect"),
    username: getConfig("db.username"),
    password: getConfig("db.password"),
    models: [User, Mail]
});
// await sql.sync({ alter: true })
// await User.create({
// 	name: "Cfp",
// 	username: "cfp",
// 	password: "1234"
// })
secure: if (getConfig("pop3s.enabled", false) || getConfig("smtps.enabled", false)) {
    let tlsKey, tlsCert;
    try {
        tlsKey = await readFile(getConfig("tls.key", "cert/privkey.pem"));
        tlsCert = await readFile(getConfig("tls.cert", "cert/fullchain.pem"));
    }
    catch (ignore) {
        break secure;
    }
    if (getConfig("pop3s.enabled", false))
        new POP3Server(getConfig("pop3s.port", 995), true, tlsKey, tlsCert); // Port 110 for regular POP3, 995 for POP3S
    if (getConfig("smtps.enabled", false))
        new SMTPServer(getConfig("smtps.port", 465), true, tlsKey, tlsCert); // Port 25 for regular SMTP, 465 for SMTPS
}
if (getConfig("smtp.enabled", true))
    new SMTPServer(getConfig("smtp.port", 25), false); // Port 25 for regular SMTP, 465 for SMTPS
if (getConfig("pop3.enabled", true))
    new POP3Server(getConfig("pop3.port", 110), false); // Port 110 for regular POP3, 995 for POP3S
