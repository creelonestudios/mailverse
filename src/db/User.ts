import { hash } from "argon2"
import { redis } from "../main.js"
import { z } from "zod"
import Mailbox from "./Mailbox.js"

const RedisUser = z.object({
	name:      z.string(),
	username:  z.string(),
	password:  z.string(),
	mailboxes: z.array(z.string())
})

// eslint-disable-next-line @typescript-eslint/no-redeclare
type RedisUser = z.infer<typeof RedisUser>

export default class User {

	#name: string; #username: string; #password: string; #mailboxes: string[]

	constructor(name: string, username: string, password: string, mailboxes: string[]) {
		this.#name = name
		this.#username = username
		this.#password = password
		this.#mailboxes = mailboxes
	}

	static async getUserFromUsername(username: string): Promise<User | undefined> {
		const user = await redis.json.get(`user:${username}`) as RedisUser | null

		if (!user) return undefined

		return new User(user.name, user.username, user.password, user.mailboxes)
	}

	async save(): Promise<void> {
		await redis.json.set(`user:${this.#username}`, "$", RedisUser.parse({
			name:      this.#name,
			username:  this.#username,
			password:  this.#password,
			mailboxes: this.#mailboxes
		}))
	}

	async getMailboxes(): Promise<Mailbox[]> {
		const mailboxes = await Promise.all(this.#mailboxes.map(uuid => Mailbox.getMailboxFromUUID(uuid)))

		return mailboxes.filter(mb => mb !== undefined) as Mailbox[]
	}

	async getDefaultMailbox(): Promise<Mailbox | undefined> {
		const mailboxes = await this.getMailboxes()

		return mailboxes.find(mb => mb.name === "INBOX")
	}

	get name(): string {
		return this.#name
	}

	set name(newName: string) {
		this.name = newName
		this.save()
	}

	get username(): string {
		return this.#username
	}

	set username(newUsername: string) {
		this.username = newUsername
		this.save()
	}

	get password(): string {
		return this.#password
	}

	set password(newPassword: string) {
		(async () => {
			this.#password = await hash(newPassword)
			this.save()
		})()
	}

	get mailboxes(): string[] {
		return this.#mailboxes
	}

	set mailboxes(mailboxes: string[]) {
		this.#mailboxes = mailboxes
		this.save()
	}

}
