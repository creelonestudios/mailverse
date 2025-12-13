import IMAPServer from "./imap/IMAPServer.js"
import Logger from "./Logger.js"
import POP3Server from "./pop3/POP3Server.js"
import POP3Upstream from "./upstreams/POP3Upstream.js"
import SMTPServer from "./smtp/SMTPServer.js"
import SMTPUpstream from "./upstreams/SMTPUpstream.js"
import { createClient } from "redis"
import getConfig from "./config.js"
import { readFile } from "node:fs/promises"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.debug = getConfig("debug", false) as any

new Logger("DEBUG", "PINK").debug("Debugging is enabled")

export const redis = createClient({ url: getConfig("redis.url", "redis://localhost:6379/") })

await redis.connect().catch(err => {
	new Logger("REDIS", "RED").error("Failed to connect to Redis:", err)
	process.exit(1)
})

// export const sql = new Sequelize({
// 	database: getConfig<string>("db.database"),
// 	dialect:  getConfig<Dialect>("db.dialect"),
// 	username: getConfig<string>("db.username"),
// 	password: getConfig<string>("db.password"),
// 	models:   [User, Mail]
// })

// await sql.sync({ alter: true })

// await User.create({
// 	name: "Cfp",
// 	username: "cfp",
// 	password: "1234"
// })

secure: if (getConfig("imaps.enabled", false) || getConfig("smtps.enabled", false)) {
	let tlsCert: Buffer, tlsKey: Buffer

	try {
		tlsKey  = await readFile(getConfig("tls.key",  "cert/privkey.pem"))
		tlsCert = await readFile(getConfig("tls.cert", "cert/fullchain.pem"))
	} catch (ignore) {
		break secure
	}

	if (getConfig("imaps.enabled", false)) new IMAPServer(getConfig("imaps.port", 993), true, tlsKey, tlsCert) // Port 143 for regular IMAP, 993 for IMAPS
	if (getConfig("smtps.enabled", false)) new SMTPServer(getConfig("smtps.port", 465), true, tlsKey, tlsCert) // Port 25 for regular SMTP, 465 for SMTPS
	if (getConfig("pop3s.enabled", false)) {
		new Logger("POP3", "YELLOW").warn("POP3 is disabled in this version.")
	}
}

if (getConfig("smtp.enabled", true)) new SMTPServer(getConfig("smtp.port", 25), false) // Port 25 for regular SMTP, 465 for SMTPS
if (getConfig("imap.enabled", true)) new IMAPServer(getConfig("imap.port", 143), false) // Port 143 for regular IMAP, 993 for IMAPS
if (getConfig("pop3.enabled", true)) {
	new Logger("POP3", "YELLOW").warn("POP3 is disabled in this version.")
}

export const popupstream  = new POP3Upstream(getConfig("upstream.pop3"))
export const smtpupstream = new SMTPUpstream(getConfig("upstream.smtp"))

setInterval(async () => {
	await popupstream.fetchNewEmails()
}, 1000 * 60 * 5) // 5 minutes
await popupstream.fetchNewEmails()
