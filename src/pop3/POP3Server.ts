import net from "net"
import { readdirSync, readFileSync } from "fs"
import User from "../models/User.js"
import { createHash } from "node:crypto"
import { readFile } from "fs/promises"

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
		sock.on("data", async (data: Buffer) => {
			const msg = data.toString()
			console.log("[POP3] Received data: " + msg)
			if(msg.startsWith("CAPA")) { // list capabilities
				sock.write("+OK Capability list follows\r\nUSER\r\n.\r\n")
			} else if(msg.startsWith("USER")) { // client gives username
				username = msg.split(" ")[1].trim()
				let _user = await User.findOne({ where: { username: username } })
				if(!_user) {
					sock.write("-ERR Invalid username or password\r\n")
					return
				}
				user = _user
				sock.write("+OK\r\n")
			} else if(msg.startsWith("PASS")) { // client gives password
				const password = msg.split(" ")[1].trim()
				const hash = createHash("sha256")
				hash.update(password)
				const hashedPassword = hash.digest("hex")
				if(user.password == hashedPassword) {
					sock.write("+OK Logged in\r\n")
				} else {
					sock.write("-ERR Invalid username or password\r\n")
				}
			} else if(msg.startsWith("STAT")) { // get number of messages and total size
				// sock.write("+OK 1 100\r\n")
				const mails = await user.$count("mails")
				console.log(mails);
				
				sock.write("+OK " + mails + "\r\n")
			} else if(msg.startsWith("QUIT")) {
				sock.write("+OK Bye\r\n")
				sock.end()
			} else if(msg.startsWith("LIST")) {
				// sock.write("+OK 1 100\r\n")
				// sock.write("1 100\r\n")
				// sock.write(".\r\n")
				const mails = await user.$get("mails")
				sock.write("+OK " + mails.length + " messages\r\n")
				for(let i = 0; i < mails.length; i++) {
					sock.write((i + 1) + "\r\n")
				}
				sock.write(".\r\n")
			} else if(msg.startsWith("RETR")) {
				// const msg = readFileSync("mails/" + readdirSync("mails")[0], "utf-8")
				// sock.write("+OK 100 octets\r\n" + msg + "\r\n.\r\n")
				const mails = await user.$get("mails")
				const index = parseInt(msg.split(" ")[1].trim()) - 1
				const mail = mails[index]
				const content = await readFile("mails/" + mail.content + ".txt", "utf-8")
				sock.write("+OK\r\n" + content + "\r\n.\r\n");
			} else if(msg.startsWith("UIDL")) { // get unique id of message
				// sock.write("-ERR Not implemented\r\n")
				const mails = await user.$get("mails")
				for(let i = 0; i < mails.length; i++) {
					sock.write((i + 1) + " " + mails[i].uuid + "\r\n")
				}
				sock.write(".\r\n")
			} else if(msg.startsWith("DELE")) {
				sock.write("+OK\r\n")
			}
		})
		sock.addListener("close", () => {
			console.log("[POP3] Client disconnected")
		})
	}

}