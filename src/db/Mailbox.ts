import Mail from "./Mail.js"
import { redis } from "../main.js"
import { z } from "zod"

const RedisMailbox = z.object({
	uuid: 	      z.string(),
	name:    	    z.string(),
	owner:        z.string(),
	uidnext:      z.number(),
	uidvalidity:  z.number(),
	attributes:   z.array(z.string()),
	mails:        z.array(z.string())
})

// eslint-disable-next-line @typescript-eslint/no-redeclare
type RedisMailbox = z.infer<typeof RedisMailbox>

export default class Mailbox {

	#uuid: string; #name: string; #owner: string; #uidnext: number; #uidvalidity: number; #attributes: string[]; #mails: string[]

	constructor(uuid: string, name: string, owner: string, uidnext: number, uidvalidity: number, attributes: string[], mails: string[]) {
		this.#uuid = uuid
		this.#name = name
		this.#owner = owner
		this.#uidnext = uidnext
		this.#uidvalidity = uidvalidity
		this.#attributes = attributes
		this.#mails = mails
	}

	static async getMailboxFromUUID(uuid: string): Promise<Mailbox | undefined> {
		const mail = await redis.json.get(`mailbox:${uuid}`) as RedisMailbox | null

		if (!mail) return undefined

		return new Mailbox(mail.uuid, mail.name, mail.owner, mail.uidnext, mail.uidvalidity, mail.attributes, mail.mails)
	}

	async save(): Promise<void> {
		await redis.json.set(`mailbox:${this.#uuid}`, "$", RedisMailbox.parse({
			uuid:        this.#uuid,
			name:        this.#name,
			owner:       this.#owner,
			uidnext:     this.#uidnext,
			uidvalidity: this.#uidvalidity,
			attributes:  this.#attributes,
			mails:       this.#mails
		}))
	}

	async getMails(): Promise<Mail[]> {
		const mails = await Promise.all(this.#mails.map(uuid => Mail.getMailFromUUID(uuid)))

		return mails.filter(mb => mb !== undefined) as Mail[]
	}

	get uuid(): string {
		return this.#uuid
	}

	get name(): string {
		return this.#name
	}

	get owner(): string {
		return this.#owner
	}

	get uidnext(): number {
		return this.#uidnext
	}

	set uidnext(value: number) {
		this.#uidnext = value
		this.save()
	}

	get uidvalidity(): number {
		return this.#uidvalidity
	}

	set uidvalidity(value: number) {
		this.#uidvalidity = value
		this.save()
	}

	get attributes(): string[] {
		return this.#attributes
	}

	set attributes(value: string[]) {
		this.#attributes = value
		this.save()
	}

	get mails(): string[] {
		return this.#mails
	}

	set mails(value: string[]) {
		this.#mails = value
		this.save()
	}

}
