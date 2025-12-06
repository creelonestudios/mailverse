import Logger from "../Logger.js"
import Mailbox from "../db/Mailbox.js"
import User from "../db/User.js"
import createStatus from "./status.js"
import net from "net"
import tls from "tls"
import { verify } from "argon2"

const logger = new Logger("IMAP", "GREEN")

type IMAPState = "NOT_AUTHENTICATED" | "AUTHENTICATED" | "SELECTED" | "LOGOUT"
type IMAPAuth = {
	authed: boolean,
	user: User | null
}
type CommandContext = {
	status: ReturnType<typeof createStatus>,
	socket: net.Socket,
	state: IMAPState,
	tag: string,
	args: string[],
	auth: IMAPAuth,
	selectedBox: Mailbox | null
}

export default class IMAPServer {

	server: net.Server
	useTLS: boolean

	constructor(port: number, useTLS: boolean, key?: Buffer, cert?: Buffer) {
		this.useTLS = useTLS

		this.server = useTLS ? tls.createServer({
			key,
			cert
		}, this.connection) : net.createServer()
		this.server.listen(port, () => {
			logger.log(`Server listening on port ${port}`)
		})
		if (!useTLS) this.server.on("connection", this.connection)
	}

	connection(sock: net.Socket) {
		const cid = crypto.randomUUID().split("").slice(0, 8)
			.join("")

		logger.log(`[${cid}] Client connected`)
		let state: IMAPState = "NOT_AUTHENTICATED"
		let auth: IMAPAuth = {
			authed:     false,
			user:       null
		}
		let selectedBox: Mailbox | null = null
		const status = createStatus(sock)

		status(false, "OK", "IMAP4rev2 Service Ready")

		sock.on("data", async (data: Buffer) => {
			const msg = data.toString()

			// logger.log(`Received data: ${msg.trim()}`)

			const messages = msg.split("\r\n").filter(m => m.trim() != "")

			for (const message of messages) {
				// eslint-disable-next-line no-await-in-loop -- We need to process each message synchronously
				await processCommand(message)
			}
		})

		async function processCommand(msg: string) {
			logger.log(`[${cid}] Received command: ${msg}`)

			const splitter = msg.split(" ")
			const [tag] = splitter
			const command = splitter[1].toUpperCase().trim()
			const args = splitter.slice(2).map(arg => arg.trim())

			const ctx: CommandContext = {
				status,
				socket: sock,
				state,
				tag,
				args,
				auth,
				selectedBox
			}

			try {
				if (commands.ANY[command]) {
					await commands.ANY[command](ctx)
				} else if (commands[state][command]) {
					await commands[state][command](ctx)
				} else {
					status(tag, "BAD", "Unknown command")
				}
			} catch (e) {
				logger.error(`${e}`)
				status(tag, "BAD", "An error occurred", "SERVERBUG")
			}

			// eslint-disable-next-line prefer-destructuring
			state = ctx.state
			// eslint-disable-next-line prefer-destructuring
			auth = ctx.auth
			// eslint-disable-next-line prefer-destructuring
			selectedBox = ctx.selectedBox
		}

		sock.addListener("close", () => {
			logger.log("Client disconnected")
		})
	}

}

const commands: { [key: string]: { [command: string]: (ctx: CommandContext) => void } } = {
	ANY: {
		CAPABILITY: (ctx: CommandContext) => {
			ctx.status(false, "CAPABILITY", "IMAP4rev2 AUTH=PLAIN")
			ctx.status(ctx.tag, "OK", "CAPABILITY completed")
		},
		NOOP: (ctx: CommandContext) => {
			ctx.status(ctx.tag, "OK", "NOOP completed")
		},
		LOGOUT: (ctx: CommandContext) => {
			ctx.status(false, "BYE", "IMAP4rev2 Server logging out")
			ctx.status(ctx.tag, "OK", "LOGOUT completed")
			ctx.socket.end()
		}
	},
	NOT_AUTHENTICATED: {
		STARTTLS: (ctx: CommandContext) => {
			ctx.status(ctx.tag, "NO", "STARTTLS not supported")
		},
		AUTHENTICATE: (ctx: CommandContext) => {
			ctx.status(ctx.tag, "NO", "AUTHENTICATE not supported")
		},
		LOGIN: async (ctx: CommandContext) => { // Spec says this should only be used as a last resort when AUTHENTICATE fails
			// ctx.status(ctx.tag, "NO", "LOGIN not supported")
			if (ctx.args.length != 2) {
				ctx.status(ctx.tag, "BAD", "LOGIN requires 2 arguments")

				return
			}

			let [username, password] = ctx.args

			if (username.startsWith("\"") && username.endsWith("\"")) {
				username = username.slice(1, -1)
			}
			if (username.includes("@")) {
				[username] = username.split("@")
			}

			if (password.startsWith("\"") && password.endsWith("\"")) {
				password = password.slice(1, -1)
			}

			logger.log(`Logging in`)

			const user = await User.getUserFromUsername(username)

			if (!user) {
				logger.debug(`User ${username} not found`)
				ctx.status(ctx.tag, "NO", "Invalid credentials", "AUTHENTICATIONFAILED")

				return
			}

			if (!(await verify(user.password, password))) {
				logger.debug(`Invalid password for user ${username}`)
				ctx.status(ctx.tag, "NO", "Invalid credentials", "AUTHENTICATIONFAILED")

				return
			}

			ctx.auth.authed = true
			ctx.auth.user = user
			ctx.state = "AUTHENTICATED"

			ctx.status(ctx.tag, "OK", "LOGIN completed")
		}
	},
	AUTHENTICATED: {
		ENABLE: (ctx: CommandContext) => {
			ctx.status(ctx.tag, "NO", "ENABLE not supported")
		},
		SELECT: async (ctx: CommandContext) => { // Select mailbox
			// ctx.status(ctx.tag, "NO", "SELECT not supported")
			if (ctx.args.length != 1) {
				ctx.status(ctx.tag, "BAD", "SELECT requires 1 argument")

				return
			}

			let [mailboxName] = ctx.args

			// TODO: This is on every string type argument. This should be a function!
			if (mailboxName.startsWith("\"") && mailboxName.endsWith("\"")) {
				mailboxName = mailboxName.slice(1, -1)
			}

			logger.log(`Selecting mailbox ${mailboxName}`)

			const mailboxes = await ctx.auth.user?.getMailboxes()

			if (!mailboxes) {
				ctx.status(ctx.tag, "NO", "User has no mailboxes")

				return
			}

			const mailbox = mailboxes.find(mb => mb.name.toUpperCase() === mailboxName.toUpperCase())

			if (!mailbox) {
				ctx.status(ctx.tag, "NO", "Mailbox not found")

				return
			}

			ctx.selectedBox = mailbox
			ctx.state = "SELECTED"

			ctx.status(false, "FLAGS", "(\\Answered \\Flagged \\Deleted \\Seen \\Draft)") // This is pretty standard
			ctx.status(false, "OK", "Flags permitted.", "PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)") // This is pretty standard too
			ctx.socket.write(`* ${mailbox.mails.length} EXISTS\r\n`)
			ctx.status(false, "OK", "UIDs valid", `UIDVALIDITY ${mailbox.uidvalidity}`)
			ctx.status(false, "OK", "Predicted next UID", `UIDNEXT ${mailbox.uidnext}`)
			ctx.status(ctx.tag, "OK", "SELECT completed", "READ-WRITE")
		},
		EXAMINE: (ctx: CommandContext) => { // Select mailbox read-only
			ctx.status(ctx.tag, "NO", "EXAMINE not supported")
		},
		CREATE: async (ctx: CommandContext) => { // Create mailbox
			let [mailboxName] = ctx.args

			if (!mailboxName) {
				ctx.status(ctx.tag, "BAD", "CREATE requires a mailbox name")

				return
			}

			if (mailboxName.startsWith("\"") && mailboxName.endsWith("\"")) {
				mailboxName = mailboxName.slice(1, -1)
			}

			if (mailboxName.includes("/") || mailboxName.includes(" ")) {
				// We don't support spaces or nested mailboxes (yet)
				ctx.status(ctx.tag, "NO", "Invalid mailbox name")

				return
			}

			logger.log(`Creating mailbox ${mailboxName}`)

			const { user } = ctx.auth

			if (!user) {
				ctx.status(ctx.tag, "NO", "User not found")

				return
			}

			if ((await user.getMailboxes()).find(mb => mb.name.toUpperCase() === mailboxName.toUpperCase())) {
				ctx.status(ctx.tag, "NO", "Mailbox already exists")

				return
			}

			const mailbox = new Mailbox(crypto.randomUUID(), mailboxName, user.username, 1, 1, [], [])

			await mailbox.save()
			user.mailboxes.push(mailbox.uuid)
			await user.save()

			ctx.status(ctx.tag, "OK", "CREATE completed")
		},
		DELETE: (ctx: CommandContext) => { // Delete mailbox
			ctx.status(ctx.tag, "NO", "DELETE not supported")
		},
		RENAME: (ctx: CommandContext) => { // Rename mailbox
			ctx.status(ctx.tag, "NO", "RENAME not supported")
		},
		SUBSCRIBE: (ctx: CommandContext) => { // Subscribe to mailbox
			ctx.status(ctx.tag, "NO", "SUBSCRIBE not supported")
		},
		UNSUBSCRIBE: (ctx: CommandContext) => { // Unsubscribe from mailbox
			ctx.status(ctx.tag, "NO", "UNSUBSCRIBE not supported")
		},
		LIST: async (ctx: CommandContext) => { // List mailboxes
			// eslint-disable-next-line prefer-const
			let [_delimiter, name] = ctx.args

			if (!name) {
				ctx.status(ctx.tag, "BAD", "LIST requires a name")

				return
			}

			if (name.startsWith("\"") && name.endsWith("\"")) {
				name = name.slice(1, -1)
			}

			const mailboxes = await ctx.auth.user?.getMailboxes()

			if (!mailboxes) {
				ctx.status(ctx.tag, "NO", "User has no mailboxes")

				return
			}

			const filtered = name == "*" ? mailboxes : mailboxes.filter(mb => mb.name.toUpperCase().includes(name.toUpperCase()))

			for (const mailbox of filtered) {
				let attributes = `${mailbox.attributes.length == 0 ? "" : `\\${mailbox.attributes.join(" \\")}`}`
				if (attributes.length > 0) attributes += " "

				attributes += "\\HasNoChildren \\UnMarked"

				ctx.status(false, "LIST", `(${attributes}) "/" ${mailbox.name}`)
			}

			ctx.status(ctx.tag, "OK", "LIST completed")
		},
		LSUB: async (ctx: CommandContext) => { // List mailboxes (old way)
			// eslint-disable-next-line prefer-const
			let [_delimiter, name] = ctx.args

			if (!name) {
				ctx.status(ctx.tag, "BAD", "LSUB requires a name")

				return
			}

			if (name.startsWith("\"") && name.endsWith("\"")) {
				name = name.slice(1, -1)
			}

			const mailboxes = await ctx.auth.user?.getMailboxes()

			if (!mailboxes) {
				ctx.status(ctx.tag, "NO", "User has no mailboxes")

				return
			}

			const filtered = name == "*" ? mailboxes : mailboxes.filter(mb => mb.name.toUpperCase().includes(name.toUpperCase()))

			for (const mailbox of filtered) {
				let attributes = `${mailbox.attributes.length == 0 ? "" : `\\${mailbox.attributes.join(" \\")}`}`
				if (attributes.length > 0) attributes += " "

				ctx.status(false, "LSUB", `(${attributes}) "/" ${mailbox.name}`)
			}

			ctx.status(ctx.tag, "OK", "LSUB completed")
		},
		NAMESPACE: (ctx: CommandContext) => { // Get namespace
			ctx.status(false, "NAMESPACE", `(("" "/")) NIL NIL`) // We only support one namespace. Only personal mailboxes are supported (NIL)
			ctx.status(ctx.tag, "OK", "NAMESPACE completed")
		},
		STATUS: (ctx: CommandContext) => { // Get mailbox status
			ctx.status(ctx.tag, "NO", "STATUS not supported")
		},
		APPEND: (ctx: CommandContext) => { // Append message to mailbox
			ctx.status(ctx.tag, "NO", "APPEND not supported")
		},
		IDLE: (ctx: CommandContext) => { // Wait for mailbox changes
			ctx.status(ctx.tag, "NO", "IDLE not supported")
		}
	},
	SELECTED: {
		CLOSE: (ctx: CommandContext) => { // Close mailbox
			ctx.status(ctx.tag, "NO", "CLOSE not supported")
		},
		UNSELECT: (ctx: CommandContext) => { // Unselect mailbox
			ctx.status(ctx.tag, "NO", "UNSELECT not supported")
		},
		EXPUNGE: (ctx: CommandContext) => { // Expunge mailbox
			ctx.status(ctx.tag, "NO", "EXPUNGE not supported")
		},
		SEARCH: (ctx: CommandContext) => { // Search mailbox
			ctx.status(ctx.tag, "NO", "SEARCH not supported")
		},
		FETCH: async (ctx: CommandContext) => { // Fetch message data
			// ctx.status(ctx.tag, "NO", "FETCH not supported")
			let useUID = false
			let [set, ...itemsRaw] = ctx.args
			if (set.toLowerCase() === "fetch") {
				useUID = true
				;[set] = itemsRaw
				itemsRaw = itemsRaw.slice(1)
			}

			// itemsRaw is currently:
			// ["(FLAGS", "INTERNALDATE", "RFC822.SIZE", "ENVELOPE)"]
			// or just ["(FLAGS)"]
			// We need to remove the parentheses
			const items = itemsRaw.map(item => item.replace("(", "").replace(")", ""))

			logger.log(`Fetching messages ${set} with items ${items.join(", ")}`)

			if (!set) {
				ctx.status(ctx.tag, "BAD", "FETCH requires a message set")

				return
			}

			// Set is a range seperated by a colon.
			// eslint-disable-next-line prefer-const
			let [start, end] = set.split(":")
			if (!end) end = start

			// It may contain a star, which means the last message.
			if (end === "*") {
				if (!ctx.selectedBox) {
					ctx.status(ctx.tag, "NO", "No mailbox selected")

					return
				}

				end = ctx.selectedBox?.mails.length.toString()
			}

			const startRange = parseInt(start, 10)
			const endRange = parseInt(end, 10)

			if (isNaN(startRange) || isNaN(endRange)) {
				ctx.status(ctx.tag, "BAD", "Invalid message set")

				return
			}

			const mails = await ctx.selectedBox?.getMails()

			if (!mails) {
				ctx.status(ctx.tag, "NO", "No messages found")

				return
			}

			let filteredIdx = 1
			for (let idx = 0; idx < mails.length; idx++) {
				const mail = mails[idx]

				if (!mail) {
					logger.error(`Mail ${idx} not found`)

					continue
				}

				let i = idx
				if (useUID) i = mail.uid
				if (i >= startRange && i <= endRange) {
					// let response = `* ${idx} FETCH (UID ${i} `
					let response = `* ${filteredIdx} FETCH (UID ${i} `

					for (const item of items) {
						if (item.toUpperCase() === "FLAGS") {
							// response += `FLAGS (\\${mail.flags.join(" \\")}) `
							response += `FLAGS (${mail.flags.length == 0 ? "" : `\\${mail.flags.join(" \\")}`}) `
						} else if (item.toUpperCase() === "RFC822.SIZE") {
							response += `RFC822.SIZE ${mail.size} `
						}
					}

					response = response.trim()

					if (items.includes("RFC822.HEADER")) {
						// eslint-disable-next-line no-await-in-loop --- We need to wait for the content
						const content = await mail.getContent()
						const [header] = content.split(/(\r)?\n(\r)?\n/g)

						response += ` RFC822.HEADER {${header.length + 1}}\r\n${header}\r\n`
					} else if (items.includes("RFC822")) {
						// eslint-disable-next-line no-await-in-loop --- We need to wait for the content
						const content = await mail.getContent()

						response += ` RFC822 {${content.length + 1}}\r\n${content}\r\n`
					}

					response += ")\r\n"
					ctx.socket.write(response)
				}

				filteredIdx++
			}

			ctx.status(ctx.tag, "OK", `${useUID ? "UID " : ""}FETCH completed`)
		},
		STORE: async (ctx: CommandContext) => { // Store message data
			let useUID = false
			let [set, thing, ...itemsRaw] = ctx.args
			if (set.toLowerCase() === "store") {
				useUID = true
				set = thing
				;[thing] = itemsRaw
				itemsRaw = itemsRaw.slice(1)
			}

			const items = itemsRaw.map(item => item.replace("(", "").replace(")", ""))

			logger.log(`Storing ${thing} to messages ${set} with items ${items.join(", ")}`)

			if (!set) {
				ctx.status(ctx.tag, "BAD", "STORE requires a message set")

				return
			}

			// Set is a range seperated by a colon.
			// eslint-disable-next-line prefer-const
			let [start, end] = set.split(":")
			if (!end) end = start

			// It may contain a star, which means the last message.
			if (end === "*") {
				if (!ctx.selectedBox) {
					ctx.status(ctx.tag, "NO", "No mailbox selected")

					return
				}

				end = ctx.selectedBox?.mails.length.toString()
			}

			const startRange = parseInt(start, 10)
			const endRange = parseInt(end, 10)

			if (isNaN(startRange) || isNaN(endRange)) {
				ctx.status(ctx.tag, "BAD", "Invalid message set")

				return
			}

			const mails = await ctx.selectedBox?.getMails()

			if (!mails) {
				ctx.status(ctx.tag, "NO", "No messages found")

				return
			}

			let filteredIdx = 1
			for (let idx = 0; idx < mails.length; idx++) {
				const mail = mails[idx]

				if (!mail) {
					logger.error(`Mail ${idx} not found`)

					continue
				}

				let i = idx
				if (useUID) i = mail.uid
				if (i >= startRange && i <= endRange) {
					if (thing.toUpperCase() === "+FLAGS") {
						const flags = items.map(flag => flag.replace("\\", ""))

						logger.log(`Adding flags ${flags.join(", ")} to message ${i}`)

						mail.flags.push(...flags)
					} else if (thing.toUpperCase() === "-FLAGS") {
						const flags = items.map(flag => flag.replace("\\", ""))

						logger.log(`Removing flags ${flags.join(", ")} to message ${i}`)

						mail.flags = mail.flags.filter(flag => !flags.includes(flag))
					}

					ctx.socket.write(`* ${filteredIdx} FETCH (FLAGS (${mail.flags.length == 0 ? "" : `\\${mail.flags.join(" \\")}`}))\r\n`)
					// eslint-disable-next-line no-await-in-loop
					await mail.save()
				}

				filteredIdx++
			}

			ctx.status(ctx.tag, "OK", "UID FETCH completed")
		},
		COPY: (ctx: CommandContext) => { // Copy message
			ctx.status(ctx.tag, "NO", "COPY not supported")
		},
		MOVE: (ctx: CommandContext) => { // Move message
			ctx.status(ctx.tag, "NO", "MOVE not supported")
		},
		UID: (ctx: CommandContext) => { // Use UID for commands
			// ctx.status(ctx.tag, "NO", "UID not supported")
			if (ctx.args.length < 2) {
				ctx.status(ctx.tag, "BAD", "UID requires a command and arguments")

				return
			}
			if (ctx.args[0].toUpperCase() === "FETCH") {
				commands.SELECTED.FETCH(ctx)
			} else if (ctx.args[0].toUpperCase() === "STORE") {
				commands.SELECTED.STORE(ctx)
			}
		}
	}
}

commands.SELECTED = { ...commands.SELECTED, ...commands.AUTHENTICATED }
