// import { Dialect } from "sequelize"
// import Mail from "./models/Mail.js"
// import POP3Server from "./pop3/POP3Server.js"
// import SMTPServer from "./smtp/SMTPServer.js"
// import { Sequelize } from "sequelize-typescript"
// import User from "./models/User.js"
import POP3Client from "./pop3/POP3Client.js"
import getConfig from "./config.js"
import { writeFile } from "node:fs/promises"

// import { readFile } from "node:fs/promises"
// import IMAPClient from "./imap/IMAPClient.js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.debug = getConfig("debug", false) as any

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

// secure: if (getConfig("pop3s.enabled", false) || getConfig("smtps.enabled", false)) {
// 	let tlsCert: Buffer, tlsKey: Buffer

// 	try {
// 		tlsKey  = await readFile(getConfig("tls.key",  "cert/privkey.pem"))
// 		tlsCert = await readFile(getConfig("tls.cert", "cert/fullchain.pem"))
// 	} catch (ignore) {
// 		break secure
// 	}

// 	if (getConfig("pop3s.enabled", false)) new POP3Server(getConfig("pop3s.port", 995), true, tlsKey, tlsCert) // Port 110 for regular POP3, 995 for POP3S
// 	if (getConfig("smtps.enabled", false)) new SMTPServer(getConfig("smtps.port", 465), true, tlsKey, tlsCert) // Port 25 for regular SMTP, 465 for SMTPS
// }

// if (getConfig("smtp.enabled", true)) new SMTPServer(getConfig("smtp.port", 25), false) // Port 25 for regular SMTP, 465 for SMTPS
// if (getConfig("pop3.enabled", true)) new POP3Server(getConfig("pop3.port", 110), false) // Port 110 for regular POP3, 995 for POP3S

// repl.start()
// const client = new IMAPClient("imap.ionos.de", 993, true)

// await client.login("<REDACTED>")

// // await client.namespaces()
// // await client.listInboxes("", "/")
// await client.selectInbox("INBOX/")
// const searchResult = await client.search("ALL")
// const ids = searchResult.replace("SEARCH ", "").replace("\r\nOK SEARCH completed", "").split(" ")
// const messagePromises = []

// ids.shift()

// for (const id of ids) messagePromises.push(client.fetchMessage(id.trim()))

// const messages = await Promise.all(messagePromises)

// for (const message of messages) console.log(message)

const client = new POP3Client("pop.ionos.de", 995, true)

await client.login("<REDACTED>", "<REDACTED>")
await new Promise(resolve => setTimeout(resolve, 1000))

writeFile("mails/1.eml", (await client.retrieveMail("1")).split("\r\n").slice(1, -2).join("\r\n"))
await new Promise(resolve => setTimeout(resolve, 1000))
writeFile("mails/2.eml", (await client.retrieveMail("2")).split("\r\n").slice(1, -2).join("\r\n"))

// const list = (await client.list()).split("\r\n").slice(1, -2) // Remove the first and last line
// const mailIds = list.map(l => l.split(" ")[0])
// const mailPromises = []
// for (const id of mailIds) mailPromises.push(client.retrieveMail(id))
// const mails = await Promise.all(mailPromises)
// for (const mail of mails) writeFile(`mails/${mailIds[mails.indexOf(mail)]}.txt`, mail)
