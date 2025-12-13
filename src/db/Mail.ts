import { redis } from "../main.js"
import { z } from "zod"

const RedisMail = z.object({
	uuid: 	   z.string(),
	uid:  	   z.number(),
	flags: 	   z.array(z.string()),
	keywords:  z.array(z.string()),
	date:      z.string(),
	size:      z.number()
})

// eslint-disable-next-line @typescript-eslint/no-redeclare
type RedisMail = z.infer<typeof RedisMail>

export default class Mail {

	#uuid: string; #uid: number; #flags: string[]; #keywords: string[]; #date: string; #size: number

	constructor(uuid: string, uid: number, flags: string[], keywords: string[], date: string, size: number) {
		this.#uuid = uuid
		this.#uid = uid
		this.#flags = flags
		this.#keywords = keywords
		this.#date = date
		this.#size = size
	}

	static async getMailFromUUID(uuid: string): Promise<Mail | undefined> {
		const mail = await redis.json.get(`mail:${uuid}`) as RedisMail | null

		if (!mail) return undefined

		return new Mail(mail.uuid, mail.uid, mail.flags, mail.keywords, mail.date, mail.size)
	}

	async save(): Promise<void> {
		await redis.json.set(`mail:${this.#uuid}`, "$", RedisMail.parse({
			uuid:     this.#uuid,
			uid:      this.#uid,
			flags:    this.#flags,
			keywords: this.#keywords,
			date:     this.#date,
			size:     this.#size
		}))
	}

	async getContent(): Promise<string> {
		const content = await redis.get(`mail:${this.#uuid}:content`)

		if (!content) throw new Error("Mail content not found")

		return content
	}

	get uuid(): string {
		return this.#uuid
	}

	get uid(): number {
		return this.#uid
	}

	set uid(uid: number) {
		this.#uid = uid
		this.save()
	}

	get flags(): string[] {
		return this.#flags
	}

	set flags(flags: string[]) {
		this.#flags = flags
		this.save()
	}

	get keywords(): string[] {
		return this.#keywords
	}

	set keywords(keywords: string[]) {
		this.#keywords = keywords
		this.save()
	}

	get date(): string {
		return this.#date
	}

	get size(): number {
		return this.#size
	}

}
