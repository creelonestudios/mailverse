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

