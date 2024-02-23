import * as argon2 from "argon2"
import Mail from "../models/Mail.js"
import { Socket } from "net"
import User from "../models/User.js"
import getConfig from "../config.js"
import { readFile } from "fs/promises"
import { popupstream } from "../main.js"

type POP3ConnectionState = {
	username: string
	user: User | undefined
	markedForDeletion: Mail[],
	login: boolean
}
type CommandHandler = (sock: Socket, args: string[], state: POP3ConnectionState) => Promise<void>

export class POP3Command {

	command: string; description: string; loginRequired: boolean; handle: CommandHandler

	constructor(command: string, description: string, loginRequired: boolean, handler: CommandHandler) {
		this.command = command
		this.description = description
		this.loginRequired = loginRequired
		this.handle = handler
	}

}

// eslint-disable-next-line require-await
const CAPA = new POP3Command("CAPA", "List capabilities", false, async (sock: Socket) => {
	sock.write("+OK Capability list follows\r\nUSER\r\n.\r\n")
})

const USER = new POP3Command("USER", "Set username", false, async (sock: Socket, args: string[], state: POP3ConnectionState) => {
	if (args.length < 1) return void sock.write("-ERR Invalid username or password\r\n")

	let username = args[0].trim().toLowerCase()
	if (username.includes("@")) {
		if (!username.endsWith(`@${getConfig("host", "localhost")}`)) return void sock.write("-ERR Invalid username or password\r\n")

		username = username.substring(0, username.lastIndexOf("@"))
	}
	if (username.startsWith("\"") && username.endsWith("\"")) username = username.substring(1, username.length-1)
	else if (username.includes("@")) {
		// this is not allowed
		return void sock.write("-ERR Invalid username or password\r\n")
	}

	const dbuser = await User.findOne({ where: { username } })

	if (!dbuser) return void sock.write("-ERR Invalid username or password\r\n")

	state.user = dbuser
	state.username = username
	sock.write("+OK\r\n")
})

const PASS = new POP3Command("PASS", "Set password and log in", false, async (sock: Socket, args: string[], state: POP3ConnectionState) => {
	if (args.length < 1 || !state.user) return void sock.write("-ERR Invalid username or password\r\n")

	const password = args[0].trim()
	const valid = await argon2.verify(state.user.password, password)

	if (valid) {
		state.login = true
		sock.write("+OK Logged in\r\n")
		await popupstream.fetchNewEmails()
	} else sock.write("-ERR Invalid username or password\r\n")
})

const STAT = new POP3Command("STAT", "Get number of messages and total size", true, async (sock: Socket, args: string[], state: POP3ConnectionState) => {
	if (!state.user) return void sock.write("-ERR Not logged in\r\n")

	const mails = await state.user.$count("mails")

	sock.write(`+OK ${mails}\r\n`)
})

// eslint-disable-next-line require-await
const QUIT = new POP3Command("QUIT", "Log out", true, async (sock: Socket) => {
	sock.write("+OK Bye\r\n")
	sock.end()
})

const LIST = new POP3Command("LIST", "List messages", true, async (sock: Socket, args: string[], state: POP3ConnectionState) => {
	if (!state.user) return void sock.write("-ERR Not logged in\r\n")

	const mails = await state.user.$get("mails")

	sock.write(`+OK ${mails.length} messages\r\n`)
	for (let i = 0; i < mails.length; i++) sock.write(`${i+1}\r\n`)

	sock.write(".\r\n")
})

const RETR = new POP3Command("RETR", "Retrieve message", true, async (sock: Socket, args: string[], state: POP3ConnectionState) => {
	if (!state.user) return void sock.write("-ERR Not logged in\r\n")

	if (args.length < 1) return void sock.write("-ERR No message specified\r\n")

	const mail = await state.user.getMail(parseInt(args[0].trim(), 10))

	if (!mail) return void sock.write("-ERR No such message\r\n")

	const content = await readFile(`mails/${mail.content}.eml`)

	sock.write(`+OK\r\n${content}\r\n.\r\n`)
})

const TOP = new POP3Command("TOP", "Retrieve message headers", true, async (sock: Socket, args: string[], state: POP3ConnectionState) => {
	if (!state.user) return void sock.write("-ERR Not logged in\r\n")

	if (args.length < 2) return void sock.write("-ERR No message specified\r\n")

	const mail = await state.user.getMail(parseInt(args[0].trim(), 10))

	if (!mail) return void sock.write("-ERR No such message\r\n")

	const content = await readFile(`mails/${mail.content}.txt`, "utf-8")
	const lines = content.split("\r\n")
	const top = lines.slice(0, 10).join("\r\n")

	sock.write(`+OK\r\n${top}\r\n.\r\n`)
})

const UIDL = new POP3Command("UIDL", "Get unique id of message", true, async (sock: Socket, args: string[], state: POP3ConnectionState) => {
	if (!state.user) return void sock.write("-ERR Not logged in\r\n")

	const mails = await state.user.$get("mails")

	for (let i = 0; i < mails.length; i++) sock.write(`${i} ${mails[i].uuid}\r\n`)

	sock.write(".\r\n")
})

const DELE = new POP3Command("DELE", "Mark message for deletion", true, async (sock: Socket, args: string[], state: POP3ConnectionState) => {
	if (!state.user) return void sock.write("-ERR Not logged in\r\n")

	if (args.length < 1) return void sock.write("-ERR No message specified\r\n")

	const mail = await state.user.getMail(parseInt(args[0].trim(), 10))

	if (!mail) return void sock.write("-ERR No such message\r\n")

	await mail.destroy()
	sock.write("+OK\r\n")
})

// eslint-disable-next-line require-await
const NOOP = new POP3Command("NOOP", "Do nothing", false, async (sock: Socket) => {
	sock.write("+OK\r\n")
})

const RSET = new POP3Command("RSET", "Reset marked messages", true, async (sock: Socket, args: string[], state: POP3ConnectionState) => {
	if (!state.user) return void sock.write("-ERR Not logged in\r\n")

	const restores = []

	for (const mail of state.markedForDeletion) restores.push(mail.restore())

	await Promise.all(restores)

	sock.write("+OK\r\n")
})

export default [CAPA, USER, PASS, STAT, QUIT, LIST, RETR, TOP, UIDL, DELE, NOOP, RSET]
