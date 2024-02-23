import { Dialect } from "sequelize"
import Mail from "./models/Mail.js"
import POP3Server from "./pop3/POP3Server.js"
import POPUpstream from "./upstreams/POPUpstream.js"
import SMTPServer from "./smtp/SMTPServer.js"
import SMTPUpstream from "./upstreams/SMTPUpstream.js"
import { Sequelize } from "sequelize-typescript"
import User from "./models/User.js"
import getConfig from "./config.js"
import { readFile } from "node:fs/promises"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.debug = getConfig("debug", false) as any

export const sql = new Sequelize({
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

const up = new POPUpstream({
	host:     getConfig("upstream.pop3.host"),
	port:     getConfig("upstream.pop3.port", 995),
	useTLS:   getConfig("upstream.pop3.useTLS", true),
	username: getConfig("upstream.pop3.username"),
	password: getConfig("upstream.pop3.password")
})

setInterval(async () => {
	await up.fetchNewEmails()
}, 1000 * 60 * 5) // 5 minutes

export const smtpupstream = new SMTPUpstream({
	host:     getConfig("upstream.smtp.host"),
	port:     getConfig("upstream.smtp.port", 25),
	useTLS:   getConfig("upstream.smtp.useTLS", false),
	username: getConfig("upstream.smtp.username"),
	password: getConfig("upstream.smtp.password")
})
