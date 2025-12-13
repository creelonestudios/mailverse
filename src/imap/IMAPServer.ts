import SaslProvider, { SASL_PROVIDERS } from "../sasl/SaslProvider.js"
import Logger from "../Logger.js"
import Mail from "../db/Mail.js"
import Mailbox from "../db/Mailbox.js"
import User from "../db/User.js"
import createStatus from "./status.js"
import getConfig from "../config.js"
import net from "net"
import { parseImapDate } from "./IMAPDate.js"
import { redis } from "../main.js"
import tls from "tls"
import { verify } from "argon2"

const logger = new Logger("IMAP", "GREEN")

type IMAPState = "NOT_AUTHENTICATED" | "AUTHENTICATED" | "SELECTED" | "LOGOUT" | "AUTHENTICATING" | "APPENDING"
type IMAPAuth = {
	authed: boolean,
	user: User | null,
	provider: SaslProvider | null,
	tag: string | null
}
type AppendData = {
	mailbox: string,
	flags: string[],
	date: Date,
	bytesTotal: number,
	data: Buffer,
	tag: string,
	prevState: IMAPState
}
type CommandContext = {
	status: ReturnType<typeof createStatus>,
	socket: net.Socket,
	state: IMAPState,
	tag: string,
	args: string[],
	auth: IMAPAuth,
	selectedBox: Mailbox | null,
	append: AppendData | null
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
			user:       null,
			provider:   null,
			tag:        null
		}
		let selectedBox: Mailbox | null = null
		let append: AppendData | null = null
		const status = createStatus(sock)

		status(false, "OK", "IMAP4rev2 Service Ready")

		sock.on("data", async (data: Buffer) => {
			const msg = data.toString()

			logger.log(`Received data: ${msg.trim()}`)

			if (state === "APPENDING" && append != null && auth.user) {
				if (append.data.length >= append.bytesTotal) {
					// We have already received all data
					return
				}

				append.data = Buffer.concat([append.data, data])

				const receivedBytes = append.data.length

				logger.log(`[${cid}] APPEND received ${receivedBytes}/${append.bytesTotal} bytes`)

				if (receivedBytes >= append.bytesTotal) {
					let mailbox = await auth.user.getDefaultMailbox()
					if (append.mailbox) {
						const targetMailbox = append.mailbox
						const mailboxes = await auth.user.getMailboxes()

						mailbox = mailboxes.find(mb => mb.name.toUpperCase() === targetMailbox.toUpperCase())
					}

					if (!mailbox) {
						status(append.tag, "NO", "Mailbox not found")
						state = append.prevState
						append = null

						return
					}

					const mailId = crypto.randomUUID()
					const newMail = new Mail(mailId, mailbox?.uidnext, append.flags, [], append.date.toISOString(), append.bytesTotal)

					await newMail.save()
					mailbox.uidnext++
					redis.set(`mail:${mailId}:content`, append.data.toString())

					mailbox.mails.push(mailId)
					await mailbox.save()

					status(append.tag, "OK", "Append completed")
					state = append.prevState
					append = null
				}

				return
			}

			const messages = msg.split("\r\n").filter(m => m.trim() != "")

			for (const message of messages) {
				// eslint-disable-next-line no-await-in-loop -- We need to process each message synchronously
				await processCommand(message)
			}
		})

		async function processCommand(msg: string) {
			logger.log(`[${cid}] Received command: ${msg}`)

			if (state === "AUTHENTICATING" && auth.provider && auth.tag) {
				const res = await auth.provider.data(msg)

				if (res.type === "failure") {
					auth.provider = null
					state = "NOT_AUTHENTICATED"
					status(auth.tag, "NO", "Authentication failed", "AUTHENTICATIONFAILED")
					auth.tag = null
				} else if (res.type === "success" && res.user) {
					auth.authed = true
					auth.user = res.user
					state = "AUTHENTICATED"
					status(auth.tag, "OK", "Authentication successful")
				}

				return
			}

			const splitter = msg.split(" ")
			const [tag] = splitter

			if (splitter.length < 2) {
				status(tag, "BAD", "Invalid command format")

				return
			}

			const command = splitter[1].toUpperCase().trim()
			const args = splitter.slice(2).map(arg => arg.trim())

			const ctx: CommandContext = {
				status,
				socket: sock,
				state,
				tag,
				args,
				auth,
				selectedBox,
				append
			}

			try {
				if (state === "AUTHENTICATING" || state === "APPENDING") {
					// We are in the middle of an AUTHENTICATE or APPEND command, ignore other commands
				} else if (commands.ANY[command]) {
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
			// eslint-disable-next-line prefer-destructuring
			append = ctx.append
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
			const providerName = ctx.args[0].toUpperCase()
			const provider = SASL_PROVIDERS[providerName]

			if (!provider) {
				ctx.status(ctx.tag, "NO", `Unsupported authentication mechanism: ${providerName}`)

				return
			}

			const saslProvider = new provider()

			if (!getConfig("imap.dangerouslyAllowInsecureAuthOverPlaintext", false) && !saslProvider.isSecure() && !(ctx.socket instanceof tls.TLSSocket)) {
				ctx.status(ctx.tag, "NO", `Insecure authentication over plaintext connections is not allowed`, "PRIVACYREQUIRED")

				return
			}

			ctx.socket.write(`+ \r\n`)
			ctx.state = "AUTHENTICATING"
			ctx.auth.provider = saslProvider
			ctx.auth.tag = ctx.tag
		},
		LOGIN: async (ctx: CommandContext) => { // Spec says this should only be used as a last resort when AUTHENTICATE fails
			// ctx.status(ctx.tag, "NO", "LOGIN not supported")
			if (ctx.args.length != 2) {
				ctx.status(ctx.tag, "BAD", "LOGIN requires 2 arguments")

				return
			}

			if (!getConfig("imap.dangerouslyAllowInsecureAuthOverPlaintext", false) && !(ctx.socket instanceof tls.TLSSocket)) {
				// eslint-disable-next-line max-len
				ctx.status("*", "BAD", "Insecure authentication not allowed over plaintext connections, but your client did it anyway. Your password may have been sent in plaintext over the internet!", "ALERT")
				ctx.status(ctx.tag, "NO", `Insecure authentication over plaintext connections is not allowed`, "PRIVACYREQUIRED")

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
			// ctx.status(ctx.tag, "NO", "APPEND not supported")
			const bytesTotalStr = ctx.args[ctx.args.length - 1]

			if (!(bytesTotalStr.includes("{") && bytesTotalStr.includes("}"))) {
				ctx.status(ctx.tag, "BAD", "APPEND requires literal byte count")
			}

			const bytesTotal = parseInt(bytesTotalStr.replace(/[{}]/g, ""), 10)

			if (isNaN(bytesTotal)) {
				ctx.status(ctx.tag, "BAD", "Invalid byte count")
			}

			let flags: string[] = []
			const date = new Date()

			if (ctx.args.length > 2) {
				// join the flags back together (from opening parenthesis to closing parenthesis)
				let flagsStr = ""
				let inFlags = false
				for (const arg of ctx.args.slice(1, ctx.args.length - 1)) {
					if (arg.startsWith("(")) inFlags = true
					if (inFlags) {
						flagsStr += `${arg} `
					}
					if (arg.endsWith(")")) inFlags = false
				}

				flagsStr = flagsStr.trim()
				if (flagsStr.startsWith("(") && flagsStr.endsWith(")")) {
					flagsStr = flagsStr.slice(1, -1)
				}

				flags = flagsStr.split(" ").map(f => f.replace("\\", ""))
			}

			if (ctx.args.length > 3) {
				// Date is the argument before the byte count
				const dateStr = ctx.args[ctx.args.length - 2]
				let cleanDateStr = dateStr
				if (dateStr.startsWith("\"") && dateStr.endsWith("\"")) {
					cleanDateStr = dateStr.slice(1, -1)
				}

				const dateISO = parseImapDate(cleanDateStr)

				if (dateISO) {
					// Valid date
					date.setTime(dateISO.getTime())
				}
			}

			// eslint-disable-next-line prefer-destructuring
			const rawMailbox = ctx.args[0]
			let mailbox = ""

			if (rawMailbox.startsWith("\"") && rawMailbox.endsWith("\"")) {
				mailbox = rawMailbox.slice(1, -1)
			} else {
				mailbox = rawMailbox
			}

			ctx.state = "APPENDING"
			ctx.append = {
				mailbox,
				bytesTotal,
				flags,
				date,
				data:      Buffer.from(""),
				tag:       ctx.tag,
				prevState: ctx.state
			}
			ctx.socket.write("+ OK Ready for literal data\r\n")
		},
		IDLE: (ctx: CommandContext) => { // Wait for mailbox changes
			ctx.status(ctx.tag, "NO", "IDLE not supported")
		}
	},
	SELECTED: {
		CLOSE: async (ctx: CommandContext) => { // Close mailbox
			const fakeSocket = ctx.socket

			fakeSocket.write = () => true

			await commands.SELECTED.EXPUNGE({
				...ctx,
				status: () => { /**/ },
				socket: fakeSocket
			})
			commands.SELECTED.UNSELECT(ctx)
		},
		UNSELECT: (ctx: CommandContext) => { // Unselect mailbox
			ctx.state = "AUTHENTICATED"
			ctx.selectedBox = null
			ctx.status(ctx.tag, "OK", "UNSELECT completed")
		},
		EXPUNGE: async (ctx: CommandContext) => { // Expunge mailbox
			if (!ctx.selectedBox) {
				ctx.status(ctx.tag, "NO", "No mailbox selected")

				return
			}

			const mails = await ctx.selectedBox.getMails()

			if (!mails) {
				ctx.status(ctx.tag, "NO", "No messages found")

				return
			}

			for (let idx = 0; idx < mails.length; idx++) {
				const mail = mails[idx]

				if (!mail) {
					logger.error(`Mail ${idx} not found`)

					continue
				}

				if (mail.flags.includes("Deleted")) {
					// eslint-disable-next-line no-await-in-loop
					await mail.delete()
					ctx.selectedBox.mails = ctx.selectedBox.mails.filter(mId => mId !== mail.uuid)
					ctx.socket.write(`* ${mail.uid} EXPUNGE\r\n`)
				}
			}

			await ctx.selectedBox.save()

			ctx.status(ctx.tag, "OK", "EXPUNGE completed")
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

						const newFlags = [...mail.flags, ...flags]

						mail.flags = Array.from(new Set(newFlags))
					} else if (thing.toUpperCase() === "-FLAGS") {
						const flags = items.map(flag => flag.replace("\\", ""))

						logger.log(`Removing flags ${flags.join(", ")} to message ${i}`)

						const newFlags = mail.flags.filter(flag => !flags.includes(flag))

						mail.flags = Array.from(new Set(newFlags))
					}

					ctx.socket.write(`* ${filteredIdx} FETCH (FLAGS (${mail.flags.length == 0 ? "" : `\\${mail.flags.join(" \\")}`}))\r\n`)
					// eslint-disable-next-line no-await-in-loop
					await mail.save()
				}

				filteredIdx++
			}

			ctx.status(ctx.tag, "OK", "FETCH completed")
		},
		COPY: async (ctx: CommandContext) => { // Copy message
			let useUID = false
			let [set, mailboxRaw] = ctx.args
			if (set.toLowerCase() === "copy") {
				useUID = true
				;[set] = ctx.args.slice(1)
				// eslint-disable-next-line prefer-destructuring
				mailboxRaw = ctx.args[2]
			}

			if (!set || !mailboxRaw) {
				ctx.status(ctx.tag, "BAD", "COPY requires a message set and a mailbox")

				return
			}

			let mailboxName = mailboxRaw
			if (mailboxRaw.startsWith("\"") && mailboxRaw.endsWith("\"")) {
				mailboxName = mailboxRaw.slice(1, -1)
			}

			logger.log(`Copying messages ${set} to mailbox ${mailboxName}`)

			// Set is a range seperated by a colon.
			// eslint-disable-next-line prefer-const
			let [start, end] = set.split(":")
			if (!end) end = start

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

			// Find target mailbox
			const mailboxes = await ctx.auth.user?.getMailboxes()

			if (!mailboxes) {
				ctx.status(ctx.tag, "NO", "User has no mailboxes")

				return
			}

			const targetMailbox = mailboxes.find(mb => mb.name.toUpperCase() === mailboxName.toUpperCase())

			if (!targetMailbox) {
				ctx.status(ctx.tag, "NO", "Target mailbox not found")

				return
			}

			for (let idx = 0; idx < mails.length; idx++) {
				const mail = mails[idx]

				if (!mail) {
					logger.error(`Mail ${idx} not found`)

					continue
				}

				let i = idx
				if (useUID) i = mail.uid
				if (i >= startRange && i <= endRange) {
					// Copy mail
					const newMailId = crypto.randomUUID()
					const newMail = new Mail(newMailId, targetMailbox.uidnext, mail.flags, [], mail.date, mail.size)

					// eslint-disable-next-line no-await-in-loop
					const content = await mail.getContent()

					redis.set(`mail:${newMailId}:content`, content)

					// eslint-disable-next-line no-await-in-loop
					await newMail.save()
					targetMailbox.uidnext++
					targetMailbox.mails.push(newMailId)
					// eslint-disable-next-line no-await-in-loop
					await targetMailbox.save()
				}
			}

			ctx.status(ctx.tag, "OK", "COPY completed")
		},
		MOVE: async (ctx: CommandContext) => { // Move message
			let useUID = false
			let [set, mailboxRaw] = ctx.args
			if (set.toLowerCase() === "move") {
				useUID = true
				;[set] = ctx.args.slice(1)
				// eslint-disable-next-line prefer-destructuring
				mailboxRaw = ctx.args[2]
			}

			if (!set || !mailboxRaw) {
				ctx.status(ctx.tag, "BAD", "MOVE requires a message set and a mailbox")

				return
			}

			let mailboxName = mailboxRaw
			if (mailboxRaw.startsWith("\"") && mailboxRaw.endsWith("\"")) {
				mailboxName = mailboxRaw.slice(1, -1)
			}

			logger.log(`Copying messages ${set} to mailbox ${mailboxName}`)

			// Set is a range seperated by a colon.
			// eslint-disable-next-line prefer-const
			let [start, end] = set.split(":")
			if (!end) end = start

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

			// Find target mailbox
			const mailboxes = await ctx.auth.user?.getMailboxes()

			if (!mailboxes) {
				ctx.status(ctx.tag, "NO", "User has no mailboxes")

				return
			}

			const targetMailbox = mailboxes.find(mb => mb.name.toUpperCase() === mailboxName.toUpperCase())

			if (!targetMailbox) {
				ctx.status(ctx.tag, "NO", "Target mailbox not found")

				return
			}

			for (let idx = 0; idx < mails.length; idx++) {
				const mail = mails[idx]

				if (!mail) {
					logger.error(`Mail ${idx} not found`)

					continue
				}

				let i = idx
				if (useUID) i = mail.uid
				if (i >= startRange && i <= endRange) {
					// Remove from current mailbox
					if (ctx.selectedBox) {
						ctx.selectedBox.mails = ctx.selectedBox.mails.filter(m => m !== mail.uuid)
						// eslint-disable-next-line no-await-in-loop
						await ctx.selectedBox?.save()
					}

					// Move mail
					mail.uid = targetMailbox.uidnext

					// eslint-disable-next-line no-await-in-loop
					const content = await mail.getContent()

					redis.set(`mail:${mail.uid}:content`, content)

					// eslint-disable-next-line no-await-in-loop
					await mail.save()
					targetMailbox.uidnext++
					targetMailbox.mails.push(mail.uuid)
					// eslint-disable-next-line no-await-in-loop
					await targetMailbox.save()
				}
			}

			ctx.status(ctx.tag, "OK", "MOVE completed")
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
			} else if (ctx.args[0].toUpperCase() === "COPY") {
				commands.SELECTED.COPY(ctx)
			} else if (ctx.args[0].toUpperCase() === "MOVE") {
				commands.SELECTED.MOVE(ctx)
			}
		}
	}
}

commands.SELECTED = { ...commands.SELECTED, ...commands.AUTHENTICATED }
