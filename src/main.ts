import { Dialect } from "sequelize"
import Mail from "./models/Mail.js"
import POP3Server from "./pop3/POP3Server.js"
import POP3Upstream from "./upstreams/POP3Upstream.js"
import SMTPServer from "./smtp/SMTPServer.js"
import SMTPUpstream from "./upstreams/SMTPUpstream.js"
import { Sequelize } from "sequelize-typescript"
import User from "./models/User.js"
import getConfig from "./config.js"
import { readFile } from "node:fs/promises"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.debug = getConfig("debug", false) as any

export const sql = new Sequelize({
	host:     getConfig<string>("db.host", "localhost"),
	database: getConfig<string>("db.database"),
	dialect:  getConfig<Dialect>("db.dialect"),
	username: getConfig<string>("db.username"),
	password: getConfig<string>("db.password"),
	models:   [User, Mail]
})

// await sql.sync({ alter: true })

// await User.create({
// 	name: "Cfp",
// 	username: "cfp",
// 	password: "1234"
// })

secure: if (getConfig("pop3s.enabled", false) || getConfig("smtps.enabled", false)) {
	let tlsCert: Buffer, tlsKey: Buffer

	try {
		tlsKey  = await readFile(getConfig("tls.key",  "cert/privkey.pem"))
		tlsCert = await readFile(getConfig("tls.cert", "cert/fullchain.pem"))
	} catch (ignore) {
		break secure
	}

	if (getConfig("pop3s.enabled", false)) new POP3Server(getConfig("pop3s.port", 995), true, tlsKey, tlsCert) // Port 110 for regular POP3, 995 for POP3S
	if (getConfig("smtps.enabled", false)) new SMTPServer(getConfig("smtps.port", 465), true, tlsKey, tlsCert) // Port 25 for regular SMTP, 465 for SMTPS
}

if (getConfig("smtp.enabled", true)) new SMTPServer(getConfig("smtp.port", 25), false) // Port 25 for regular SMTP, 465 for SMTPS
if (getConfig("pop3.enabled", true)) new POP3Server(getConfig("pop3.port", 110), false) // Port 110 for regular POP3, 995 for POP3S

export const popupstream  = new POP3Upstream(getConfig("upstream.pop3"))
export const smtpupstream = new SMTPUpstream(getConfig("upstream.smtp"))

setInterval(async () => {
	await popupstream.fetchNewEmails()
}, 1000 * 60 * 5) // 5 minutes
await popupstream.fetchNewEmails()
