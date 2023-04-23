import net from "net"
import { readdirSync, readFileSync } from "fs"
import User from "../models/User.js"
import { createHash } from "node:crypto"
import { readFile } from "fs/promises"
import Mail from "../models/Mail.js"

export default class POP3Server {

	server: net.Server

	constructor(port: number) {
		this.server = net.createServer()
		this.server.listen(port, () => {
			console.log("[POP3] Server listening on port " + port)
		})
		this.server.on("connection", this.connection)
	}

	connection(sock: net.Socket) {
		console.log("[POP3] Client connected")
		sock.write("+OK POP3 server ready\r\n")
		let username = ""
		let user: User;
		let markedForDeletion = [] as Mail[]
		sock.on("data", async (data: Buffer) => {
			const msg = data.toString()
			console.log("[POP3] Received data: " + msg)
			const args = msg.split(" ").slice(1)
			if(msg.startsWith("CAPA")) { // list capabilities
				sock.write("+OK Capability list follows\r\nUSER\r\n.\r\n")
			} else if(msg.startsWith("USER")) { // client gives username
				if(args.length < 1) {
					sock.write("-ERR Invalid username or password\r\n")
					return
				}
				username = args[0].trim().toLowerCase()
				let _user = await User.findOne({ where: { username: username } })
				if(!_user) {
					sock.write("-ERR Invalid username or password\r\n")
					return
				}
				user = _user
				sock.write("+OK\r\n")
			} else if(msg.startsWith("PASS")) { // client gives password
				if(args.length < 1) {
					sock.write("-ERR Invalid username or password\r\n")
					return
				}
				const password = args[0].trim()
				const hash = createHash("sha256")
				hash.update(password)
				const hashedPassword = hash.digest("hex")
				if(user.password == hashedPassword) {
					sock.write("+OK Logged in\r\n")
				} else {
					sock.write("-ERR Invalid username or password\r\n")
				}
			} else if(msg.startsWith("STAT")) { // get number of messages and total size
				const mails = await user.$count("mails")
				sock.write("+OK " + mails + "\r\n")
			} else if(msg.startsWith("QUIT")) {
				sock.write("+OK Bye\r\n")
				sock.end()
			} else if(msg.startsWith("LIST")) {
				const mails = await user.$get("mails")
				sock.write("+OK " + mails.length + " messages\r\n")
				for(let i = 0; i < mails.length; i++) {
					sock.write((i + 1) + "\r\n")
				}
				sock.write(".\r\n")
			} else if(msg.startsWith("RETR")) {
				if(args.length < 1) {
					sock.write("-ERR No message specified\r\n")
					return
				}
				const mail = await user.getMail(parseInt(args[0].trim()))
				if(!mail) {
					sock.write("-ERR No such message\r\n")
					return
				}
				const content = await readFile("mails/" + mail.content + ".txt", "utf-8")
				sock.write("+OK\r\n" + content + "\r\n.\r\n");
			} else if(msg.startsWith("TOP")) {
				if(args.length < 2) {
					sock.write("-ERR No message specified\r\n")
					return
				}
				const mail = await user.getMail(parseInt(args[0].trim()))
				if(!mail) {
					sock.write("-ERR No such message\r\n")
					return
				}
				const content = await readFile("mails/" + mail.content + ".txt", "utf-8")
				const lines = content.split("\r\n")
				const top = lines.slice(0, 10).join("\r\n")
				sock.write("+OK\r\n" + top + "\r\n.\r\n");
			} else if(msg.startsWith("UIDL")) { // get unique id of message
				const mails = await user.$get("mails")
				for(let i = 0; i < mails.length; i++) {
					sock.write((i + 1) + " " + mails[i].uuid + "\r\n")
				}
				sock.write(".\r\n")
			} else if(msg.startsWith("DELE")) {
				if(args.length < 1) {
					sock.write("-ERR No message specified\r\n")
					return
				}
				const mail = await user.getMail(parseInt(args[0].trim()))
				if(!mail) {
					sock.write("-ERR No such message\r\n")
					return
				}
				await mail.destroy()
				sock.write("+OK\r\n")
			} else if(msg.startsWith("NOOP")) { // this is used to keep the connection alive
				sock.write("+OK\r\n")
			} else if(msg.startsWith("RSET")) {
				for(const mail of markedForDeletion) {
					await mail.restore();
				}
				sock.write("+OK\r\n")
			}
		})
		sock.addListener("close", () => {
			console.log("[POP3] Client disconnected")
		})
	}

}